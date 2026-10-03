import { product } from "./product";
// The installer resolves the latest published release; version metadata stays internal.
export const releaseVersion = product.version;
export const releaseURL = "https://github.com/torana-edge/torana-edge/releases/latest";
export const installCommand = "curl -fsSL https://torana.sh/install.sh | sh";
export const windowsInstallCommand = `$installer = Join-Path $env:TEMP ("torana-install-" + [guid]::NewGuid() + ".ps1")
Invoke-WebRequest https://torana.sh/install.ps1 -OutFile $installer
& $installer
Remove-Item -LiteralPath $installer`;
