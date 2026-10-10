#define MyAppName "Aurion"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Aurion Project"
#define MyAppExeName "Aurion.exe"

[Setup]
AppId={{E8D799B2-3A58-4C3A-9E5C-6E64B4D72A1B}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
; Instalación a nivel de usuario sin requerir elevación ni permisos de admin
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=commandline
UsedUserAreasWarning=no
CreateUninstallRegKey=no
UpdateUninstallLogAppName=no
DefaultDirName={localappdata}\Programs\{#MyAppName}
DisableProgramGroupPage=yes
OutputDir=Output
OutputBaseFilename=AurionSetup
SetupIconFile=icon.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "extdesktopicon"; Description: "Crear acceso directo a la carpeta de la Extensión en el Escritorio"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; Empaqueta toda la carpeta generada por PyInstaller con sus librerías, frontend y binarios
Source: "dist\Aurion\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; Empaqueta la carpeta de la extensión de navegador
Source: "extension\*"; DestDir: "{app}\extension"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{userprograms}\{#MyAppName}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{userprograms}\{#MyAppName}\Carpeta de la Extensión"; Filename: "{app}\extension"
Name: "{userdesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; IconFilename: "{app}\{#MyAppExeName}"
Name: "{userdesktop}\Carpeta Extensión Aurion"; Filename: "{app}\extension"; Tasks: extdesktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall