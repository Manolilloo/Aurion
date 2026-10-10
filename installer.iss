#define MyAppName "Aurion"
#define MyAppVersion "1.0.3"
#define MyAppPublisher "Aurion Project"
#define MyAppExeName "Aurion.exe"

[Setup]
AppId={{E8D799B2-3A58-4C3A-9E5C-6E64B4D72A1B}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}

; --- PERMISOS Y PRIVILEGIOS ---
; Instalación por usuario: no salta UAC (cartel amarillo de Windows)
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=commandline
UsedUserAreasWarning=no

; --- DESINSTALADOR LIMPIO ---
; Cámbialos a 'yes' para que aparezca en "Configuración > Aplicaciones instaladas" de Windows
CreateUninstallRegKey=yes
UpdateUninstallLogAppName=yes

; --- DINAMISMO DE RUTA ---
; Sugiere esta ruta por defecto (disco C: sin pedir admin), pero PERMITE al usuario pulsar "Examinar"
DefaultDirName={localappdata}\Programs\{#MyAppName}
DisableDirPage=no
; Avisa si la carpeta elegida ya existe
DirExistsWarning=no
; Permite crear la carpeta si no existe
EnableDirDoesntExistWarning=no

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
Source: "dist\Aurion\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "extension\*"; DestDir: "{app}\extension"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{userprograms}\{#MyAppName}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{userprograms}\{#MyAppName}\Carpeta de la Extensión"; Filename: "{app}\extension"
Name: "{userprograms}\{#MyAppName}\Desinstalar {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{userdesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; IconFilename: "{app}\{#MyAppExeName}"
Name: "{userdesktop}\Carpeta Extensión Aurion"; Filename: "{app}\extension"; Tasks: extdesktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall