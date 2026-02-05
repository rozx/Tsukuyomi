# Build Troubleshooting & Configuration Guide

## macOS "Risky" Warning

If you see a warning that the application is "damaged", "risky", or "cannot be opened" on macOS, this is because the application is not **Notarized** by Apple.

### The Fix (For Distribution)
To fix this for users downloading your app, you must sign and notarize the application. This requires an Apple Developer Account (~$99/year).

#### Step 1: Export your Developer Certificate (p12)
1.  Open **Keychain Access** on your Mac.
2.  Select "My Certificates" from the left sidebar.
3.  Locate your "Developer ID Application: [Your Name/Team]" certificate.
    *   *If you don't have one, create it on [developer.apple.com](https://developer.apple.com/account/resources/certificates/list) > Certificates > "+" > "Developer ID Application". Download and double-click to install.*
4.  Right-click the certificate (ensure the private key is included/nested) and choose **Export "Developer ID Application..."**.
5.  Save it as `certificate.p12`.
6.  Enter a strong password when prompted (remember this password).

#### Step 2: Encode the Certificate
Run this command in your terminal to get the base64 string:
```bash
base64 -i /path/to/certificate.p12 | pbcopy
```
*This copies the long string to your clipboard.*

#### Step 3: Generate App-Specific Password
1.  Go to [appleid.apple.com](https://appleid.apple.com/).
2.  Sign in and go to "App-Specific Passwords".
3.  Generate a new one (e.g., named "GitHub Actions").
4.  Copy the password (format: `xxxx-xxxx-xxxx-xxxx`).

#### Step 4: Add Secrets to GitHub
1.  Go to your GitHub Repository > **Settings** > **Secrets and variables** > **Actions**.
2.  Click **New repository secret** for each of the following:

| Name | Value | Description |
| :--- | :--- | :--- |
| `CSC_LINK` | [Paste from Clipboard] | The base64-encoded p12 content (from Step 2). |
| `CSC_KEY_PASSWORD` | [Your p12 Password] | The password you set in Step 1.6. |
| `APPLE_ID` | [Your Apple ID Email] | e.g. `user@example.com` |
| `APPLE_APP_SPECIFIC_PASSWORD` | [xxxx-xxxx-xxxx-xxxx] | The password from Step 3. |

Once these variables are present, the GitHub Action will automatically:
1.  Decode the certificate.
2.  Sign the application.
3.  Notarize it with Apple.
4.  Staple the notarization ticket.

The resulting `.dmg` and `.zip` files will be safe to open on any Mac.

### Local Build Signing

To sign the app when running `bun run build:electron` locally on your Mac:

1.  **Install Certificate**: Double-click your `certificate.p12` file to add it to your **Keychain Access**.
2.  **Auto-Discovery**: By default, the build tool (`electron-builder`) automatically looks for valid "Developer ID Application" certificates in your Keychain. You generally don't need extra config.
3.  **Manual Override**: If you need to force a specific certificate or notarize locally, you can create a `.env` file in the project root:

    ```env
    # Only if you want to override Keychain auto-discovery
    CSC_LINK=/path/to/certificate.p12
    CSC_KEY_PASSWORD=your_password
    
    # Required for Notarization (if you want to notarize local builds)
    APPLE_ID=your_email@example.com
    APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
    ```
4.  **Verify**: Run `security find-identity -v` in your terminal to see available signing identities.

### The Workaround (For Local Use)
If you just want to run the app you downloaded:
1.  Open Terminal.
2.  Run: `xattr -cr /path/to/Tsukuyomi.app`
3.  Open the app.

We have updated the build configuration to produce a `.dmg` file, which is the standard distribution format and generally behaves better than a zipped .app bundle.

## Windows "No Main Window" / Background Issue

If the application starts but only shows in the taskbar (no window visible), we have implemented several fixes:

1.  **Ready-to-Show**: We now wait for the `ready-to-show` event before displaying the window. This ensures the content is rendered.
2.  **Fallback Timeout**: If the window doesn't appear within 10 seconds, we force it to show.
3.  **Puppeteer Initialization**: We've added logging around the puppeteer initialization to detect if it hangs.
4.  **Installer**: We now build an NSIS `Setup.exe` in addition to the portable executable. Try installing the app using the Setup file, as it often handles dependencies and paths more reliably than the portable version.

### Debugging
If the issue persists on Windows:
1.  Check the logs. The application logs to the console.
2.  Start the app from PowerShell/CMD to see the output:
    ```powershell
    ./Tsukuyomi-Portable.exe
    ```
3.  Look for `[Electron]` logs.
