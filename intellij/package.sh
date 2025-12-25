#!/bin/bash
# Vestige 1.0.3 Master Packaging Script (IntelliJ)
# Run this from the root of the intellij directory

echo "🗿 Vestige Master Release 1.0.3 - Packaging starting..."

# Ensure we are in the intellij directory
if [ ! -f "build.gradle.kts" ]; then
    echo "❌ Error: Please run this script from the 'intellij' directory."
    exit 1
fi

# Check for gradlew
if [ ! -f "gradlew" ]; then
    echo "⚠️  gradlew not found. Attempting to use system gradle..."
    GRADLE_CMD="gradle"
else
    chmod +x gradlew
    GRADLE_CMD="./gradlew"
fi

# Execute build
echo "🏗️  Building Plugin..."
$GRADLE_CMD buildPlugin

if [ $? -eq 0 ]; then
    ARTIFACT=$(find build/distributions -name "*.zip" | head -n 1)
    echo "✅ Success! Master Release Package created at:"
    echo "👉 $ARTIFACT"
else
    echo "❌ Build failed. Please ensure Java 17+ and Gradle are installed."
    exit 1
fi
