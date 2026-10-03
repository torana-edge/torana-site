import { product } from "./product";
// Pin the first-run experience to the published, verified release.
export const releaseVersion = product.version;
export const releaseURL = `https://github.com/torana-edge/torana-edge/releases/tag/v${releaseVersion}`;
export const installCommand = `curl -fsSL https://torana.sh/install.sh | sh -s -- --version ${releaseVersion}
export PATH="$HOME/.local/bin:$PATH"
torana version`;
export const windowsInstallCommand = `$installer = Join-Path $env:TEMP ("torana-install-" + [guid]::NewGuid() + ".ps1")
Invoke-WebRequest https://torana.sh/install.ps1 -OutFile $installer
& $installer -Version ${releaseVersion}
Remove-Item -LiteralPath $installer
$env:PATH = "$env:LOCALAPPDATA\\Torana\\bin;$env:PATH"
torana version`;
