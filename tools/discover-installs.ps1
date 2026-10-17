<#
.SYNOPSIS
  Read-only scan for the game installs a Minecraft <-> KSP bridge would plug into.

.DESCRIPTION
  Finds Minecraft Java instances (vanilla launcher, CurseForge, Modrinth App, Prism,
  MultiMC, ATLauncher, GDLauncher) and Kerbal Space Program installs (Steam libraries,
  GOG, common folders), then reports:

    - Minecraft versions, loader (Fabric / NeoForge / Forge), and every mod jar whose
      id or filename looks like Create, Sable, Simulated, Aeronautics, Offroad.
    - KSP version, build id, whether the managed DLLs a plugin compiles against exist,
      the Unity player version, and what's in GameData (kRPC, ModuleManager, Harmony...).

  Nothing is written anywhere except the JSON report. Jars are opened read-only.
  Your Windows username is replaced with <user> in the report unless -NoRedact is given.

  Works in Windows PowerShell 5.1 and PowerShell 7+.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\discover-installs.ps1
  powershell -ExecutionPolicy Bypass -File .\discover-installs.ps1 -ExtraPaths 'D:\Games\KSP_1.12;E:\KSP_RSS'
#>
param(
  [string]$AppData     = $env:APPDATA,
  [string]$UserProfile = $env:USERPROFILE,
  [string[]]$ExtraPaths = @(),
  [string]$OutFile     = (Join-Path (Get-Location) 'hsp-discovery.json'),
  [switch]$NoRedact
)

$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue

# Mod ids / filenames we care about. "create" also catches addons, which is useful to see.
$ModPattern  = '(?i)create|sable|simulated|aeronautics|offroad'
$KspModNames = '(?i)krpc|modulemanager|harmony|kopernicus|far|realfuels|principia'

function Read-ZipEntryText($zip, [string]$name) {
  $entry = $zip.GetEntry($name)
  if (-not $entry) { return $null }
  $reader = New-Object System.IO.StreamReader($entry.Open())
  try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
}

function Get-JarModInfo([string]$path) {
  $info = [ordered]@{ file = (Split-Path $path -Leaf); loader = $null; id = $null; version = $null }
  try {
    $zip = [System.IO.Compression.ZipFile]::OpenRead($path)
  } catch {
    $info.error = "unreadable jar"
    return $info
  }
  try {
    $fabric = Read-ZipEntryText $zip 'fabric.mod.json'
    if ($fabric) {
      $info.loader = 'fabric'
      try {
        $j = $fabric | ConvertFrom-Json
        $info.id = $j.id; $info.version = $j.version
      } catch { $info.error = 'bad fabric.mod.json' }
    }
    foreach ($toml in 'META-INF/neoforge.mods.toml', 'META-INF/mods.toml') {
      if ($info.id) { break }
      $t = Read-ZipEntryText $zip $toml
      if (-not $t) { continue }
      $info.loader = if ($toml -like '*neoforge*') { 'neoforge' } else { 'forge' }
      # First [[mods]] block holds the jar's own mod.
      $block = ($t -split '\[\[mods\]\]')[1]
      if ($block) {
        if ($block -match '(?m)^\s*modId\s*=\s*"([^"]+)"')   { $info.id = $Matches[1] }
        if ($block -match '(?m)^\s*version\s*=\s*"([^"]+)"') { $info.version = $Matches[1] }
      }
      if ($info.version -like '*{file.jarVersion}*') {
        $mf = Read-ZipEntryText $zip 'META-INF/MANIFEST.MF'
        if ($mf -and $mf -match '(?m)^Implementation-Version:\s*(\S+)') { $info.version = $Matches[1] }
      }
    }
  } finally { $zip.Dispose() }
  return $info
}

function Get-InstanceReport([string]$name, [string]$launcher, [string]$gameDir, [string]$mcVersion, [string]$loader) {
  $mods = @()
  $total = 0
  $modsDir = Join-Path $gameDir 'mods'
  if (Test-Path $modsDir) {
    $jars = @(Get-ChildItem -Path $modsDir -Filter '*.jar' -File -ErrorAction SilentlyContinue)
    $total = $jars.Count
    foreach ($jar in $jars) {
      $m = Get-JarModInfo $jar.FullName
      if ("$($m.id) $($m.file)" -match $ModPattern) { $mods += $m }
      if (-not $loader -and $m.loader) { $loader = $m.loader }
    }
  }
  return [ordered]@{
    launcher = $launcher; name = $name; gameDir = $gameDir
    minecraft = $mcVersion; loader = $loader
    modCount = $total; relevantMods = $mods
    schematics = (Test-Path (Join-Path $gameDir 'schematics'))
  }
}

# ---------------------------------------------------------------- Minecraft

$instances = @()

# Vanilla launcher: .minecraft itself plus any profile with a custom gameDir.
$dotMc = Join-Path $AppData '.minecraft'
if (Test-Path $dotMc) {
  $versions = @()
  $vdir = Join-Path $dotMc 'versions'
  if (Test-Path $vdir) { $versions = @(Get-ChildItem $vdir -Directory | ForEach-Object Name) }
  $r = Get-InstanceReport '.minecraft' 'vanilla' $dotMc $null $null
  $r.installedVersions = $versions
  $instances += $r

  $profiles = Join-Path $dotMc 'launcher_profiles.json'
  if (Test-Path $profiles) {
    try {
      $p = Get-Content $profiles -Raw | ConvertFrom-Json
      foreach ($prop in $p.profiles.PSObject.Properties) {
        $prof = $prop.Value
        if ($prof.gameDir -and (Test-Path $prof.gameDir) -and ($prof.gameDir -ne $dotMc)) {
          $instances += Get-InstanceReport $prof.name 'vanilla-profile' $prof.gameDir $prof.lastVersionId $null
        }
      }
    } catch { }
  }
}

# CurseForge
foreach ($root in @(Join-Path $UserProfile 'curseforge/minecraft/Instances')) {
  if (-not (Test-Path $root)) { continue }
  foreach ($d in Get-ChildItem $root -Directory) {
    $mc = $null; $ld = $null
    $meta = Join-Path $d.FullName 'minecraftinstance.json'
    if (Test-Path $meta) {
      try {
        $j = Get-Content $meta -Raw | ConvertFrom-Json
        $mc = $j.gameVersion
        if ($j.baseModLoader) { $ld = $j.baseModLoader.name }
      } catch { }
    }
    $instances += Get-InstanceReport $d.Name 'curseforge' $d.FullName $mc $ld
  }
  break
}

# Prism / MultiMC (instance/.minecraft or instance/minecraft, version in mmc-pack.json)
$prismRoots = @(
  (Join-Path $AppData 'PrismLauncher/instances'),
  (Join-Path $UserProfile 'MultiMC/instances')
)
foreach ($root in $prismRoots | Select-Object -Unique) {
  if (-not (Test-Path $root)) { continue }
  foreach ($d in Get-ChildItem $root -Directory) {
    $gd = @('.minecraft', 'minecraft') | ForEach-Object { Join-Path $d.FullName $_ } | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $gd) { continue }
    $mc = $null; $ld = $null
    $pack = Join-Path $d.FullName 'mmc-pack.json'
    if (Test-Path $pack) {
      try {
        foreach ($c in (Get-Content $pack -Raw | ConvertFrom-Json).components) {
          switch ($c.uid) {
            'net.minecraft'           { $mc = $c.version }
            'net.fabricmc.fabric-loader' { $ld = "fabric $($c.version)" }
            'net.neoforged'           { $ld = "neoforge $($c.version)" }
            'net.minecraftforge'      { $ld = "forge $($c.version)" }
          }
        }
      } catch { }
    }
    $instances += Get-InstanceReport $d.Name 'prism/multimc' $gd $mc $ld
  }
}

# Modrinth App, ATLauncher, GDLauncher: profile folders are game dirs directly.
$otherRoots = @(
  @{ l = 'modrinth';   p = (Join-Path $AppData 'ModrinthApp/profiles') },
  @{ l = 'modrinth';   p = (Join-Path $AppData 'com.modrinth.theseus/profiles') },
  @{ l = 'atlauncher'; p = (Join-Path $AppData 'ATLauncher/instances') },
  @{ l = 'gdlauncher'; p = (Join-Path $AppData 'gdlauncher_next/instances') }
)
foreach ($o in $otherRoots) {
  if (-not (Test-Path $o.p)) { continue }
  foreach ($d in Get-ChildItem $o.p -Directory) {
    $instances += Get-InstanceReport $d.Name $o.l $d.FullName $null $null
  }
}

# ---------------------------------------------------------------- KSP

function Get-SteamLibraries {
  $libs = @()
  $steam = $null
  try { $steam = (Get-ItemProperty 'HKCU:\Software\Valve\Steam' -ErrorAction Stop).SteamPath } catch { }
  if (-not $steam) { $steam = 'C:\Program Files (x86)\Steam' }
  if (-not (Test-Path $steam)) { return @() }
  $vdf = Join-Path $steam 'steamapps/libraryfolders.vdf'
  if (Test-Path $vdf) {
    foreach ($m in [regex]::Matches((Get-Content $vdf -Raw), '"path"\s+"([^"]+)"')) {
      $libs += ($m.Groups[1].Value -replace '\\\\', '\')
    }
  }
  if (Test-Path $steam) { $libs += $steam }
  return $libs | Select-Object -Unique
}

function Get-KspReport([string]$dir, [string]$source) {
  $r = [ordered]@{ source = $source; path = $dir; game = 'KSP1'; version = $null; buildId = $null }
  if ((Split-Path $dir -Leaf) -match '2') { $r.game = 'KSP2' }

  $readme = Join-Path $dir 'readme.txt'
  if (Test-Path $readme) {
    $m = Select-String -Path $readme -Pattern 'Version\s+(\d+\.\d+(\.\d+)?)' | Select-Object -First 1
    if ($m) { $r.version = $m.Matches[0].Groups[1].Value }
  }
  foreach ($b in 'buildID64.txt', 'buildID.txt') {
    $bp = Join-Path $dir $b
    if (Test-Path $bp) {
      $m = Select-String -Path $bp -Pattern 'build id\s*=\s*(\d+)' | Select-Object -First 1
      if ($m) { $r.buildId = $m.Matches[0].Groups[1].Value; break }
    }
  }

  # A KSP plugin compiles against these; ReShade/compositing needs to know the player.
  $dataDir = @('KSP_x64_Data', 'KSP_Data', 'KSP2_x64_Data') | ForEach-Object { Join-Path $dir $_ } | Where-Object { Test-Path $_ } | Select-Object -First 1
  $r.managedDlls = [ordered]@{}
  if ($dataDir) {
    foreach ($dll in 'Assembly-CSharp.dll', 'UnityEngine.dll', 'UnityEngine.CoreModule.dll', 'UnityEngine.PhysicsModule.dll') {
      $r.managedDlls[$dll] = Test-Path (Join-Path $dataDir "Managed/$dll")
    }
  }
  $player = Join-Path $dir 'UnityPlayer.dll'
  if (Test-Path $player) { $r.unityPlayer = (Get-Item $player).VersionInfo.FileVersion }

  $gd = Join-Path $dir 'GameData'
  $r.gameData = @()
  $r.notableMods = @()
  if (Test-Path $gd) {
    $r.gameData = @(Get-ChildItem $gd -Directory | ForEach-Object Name)
    $r.notableMods = @($r.gameData | Where-Object { $_ -match $KspModNames })
    $r.notableMods += @(Get-ChildItem $gd -Filter '*.dll' -File | ForEach-Object Name)
  }
  $saves = Join-Path $dir 'saves'
  if (Test-Path $saves) { $r.saves = @(Get-ChildItem $saves -Directory | ForEach-Object Name) }
  return $r
}

$kspCandidates = @()
foreach ($lib in Get-SteamLibraries) {
  foreach ($n in 'Kerbal Space Program', 'Kerbal Space Program 2') {
    $kspCandidates += @{ p = (Join-Path $lib "steamapps/common/$n"); s = 'steam' }
  }
}
foreach ($p in 'C:\GOG Games\Kerbal Space Program', 'C:\Program Files (x86)\GOG Galaxy\Games\Kerbal Space Program', 'C:\KSP', 'D:\KSP', 'C:\Games\Kerbal Space Program', 'D:\Games\Kerbal Space Program') {
  $kspCandidates += @{ p = $p; s = 'common-path' }
}
# -File passes "-ExtraPaths a,b" as one string, so split it here.
foreach ($p in ($ExtraPaths -split '[;,]' | Where-Object { $_ })) { $kspCandidates += @{ p = $p.Trim(); s = 'extra' } }

$ksp = @()
$seen = @{}
foreach ($c in $kspCandidates) {
  if (-not (Test-Path $c.p) -or $seen[$c.p]) { continue }
  $seen[$c.p] = $true
  $isKsp = (Test-Path (Join-Path $c.p 'GameData')) -or (Test-Path (Join-Path $c.p 'KSP_x64.exe')) -or (Test-Path (Join-Path $c.p 'KSP2_x64.exe'))
  if ($isKsp) { $ksp += Get-KspReport $c.p $c.s }
}

# ---------------------------------------------------------------- System

$sys = [ordered]@{ os = [System.Environment]::OSVersion.VersionString; ps = $PSVersionTable.PSVersion.ToString(); gpus = @(); java = @() }
try { $sys.gpus = @(Get-CimInstance Win32_VideoController -ErrorAction Stop | ForEach-Object Name) } catch { }
foreach ($j in Get-Command java -All -ErrorAction SilentlyContinue) { $sys.java += $j.Source }

# ---------------------------------------------------------------- Report

$report = [ordered]@{
  generated = (Get-Date).ToString('s')
  system = $sys
  minecraft = $instances
  ksp = $ksp
}
$json = $report | ConvertTo-Json -Depth 8
if (-not $NoRedact -and $env:USERNAME) {
  $json = $json -replace [regex]::Escape($env:USERNAME), '<user>'
}
[System.IO.File]::WriteAllText($OutFile, $json)

Write-Host ""
Write-Host "Minecraft instances: $($instances.Count)"
foreach ($i in $instances) {
  $rel = ($i.relevantMods | ForEach-Object { if ($_.id) { "$($_.id) $($_.version)" } else { "$($_.file) ($($_.error))" } }) -join ', '
  Write-Host ("  [{0}] {1}  mc={2} loader={3} mods={4}  {5}" -f $i.launcher, $i.name, $i.minecraft, $i.loader, $i.modCount, $rel)
}
Write-Host "KSP installs: $($ksp.Count)"
foreach ($k in $ksp) {
  Write-Host ("  [{0}] {1} {2} build {3}  plugins: {4}" -f $k.source, $k.game, $k.version, $k.buildId, ($k.notableMods -join ', '))
}
Write-Host ""
Write-Host "Report written to $OutFile"
