---
description: How to publish the Vestige IntelliJ plugin to the JetBrains Marketplace
---

To publish the Vestige IntelliJ plugin, follow these steps:

### 1. Preparation
- Create an account on [JetBrains Marketplace](https://plugins.jetbrains.com/).
- Generate a [Permanent Token](https://plugins.jetbrains.com/author/me/tokens) for publishing.
- If you want to sign your plugin (highly recommended), generate a certificate and a private key.

### 2. Configuration
The `build.gradle.kts` is already configured to use environment variables for sensitive data. You need to set these in your terminal or CI/CD environment:

- `PUBLISH_TOKEN`: Your JetBrains Marketplace permanent token.
- `CERTIFICATE_CHAIN`: (Optional for signing) The content of your certificate chain file.
- `PRIVATE_KEY`: (Optional for signing) The content of your private key file.
- `PRIVATE_KEY_PASSWORD`: (Optional for signing) The password for your private key.

### 3. Build & Verify
Before publishing, ensure the plugin builds correctly and passes verification:

```bash
cd intellij
./gradlew buildPlugin
./gradlew verifyPlugin
```

### 4. Publish
Once verified, run the publishing task:

```bash
./gradlew publishPlugin
```

This task will:
1. Build the plugin.
2. Sign it (if variables are set).
3. Upload it to the Marketplace using your token.

> [!NOTE]
> For the first upload, you might need to upload manually via the Marketplace web interface to create the plugin entry. Subsequent updates can be handled entirely via Gradle.
