# 🤝 Contributing to Learn With Velmorth

Thank you for your interest in contributing! This document outlines the guidelines and best practices for contributing to the project.

---

## 📋 Table of Contents

1. [Getting Started](#-getting-started)
2. [Code of Conduct](#-code-of-conduct)
3. [Development Workflow](#-development-workflow)
4. [Commit Message Guidelines](#-commit-message-guidelines)
5. [Coding Standards](#-coding-standards)
6. [Pull Request Process](#-pull-request-process)
7. [Testing](#-testing)

---

## 🚀 Getting Started

### Fork and Clone
```bash
# Fork the repository on GitHub
# Clone your fork
git clone https://github.com/YOUR_USERNAME/learning-velmorth.git
cd learning-velmorth

# Add upstream remote
git remote add upstream https://github.com/manish63018-sketch/learning-velmorth.git
```

### Set Up Development Environment
1. Open Android Studio Ladybug (2024.2.1+)
2. File → Open → select project folder
3. Wait for Gradle sync to complete
4. Create `apikey.properties` from the example:
   ```bash
   cp apikey.properties.example apikey.properties
   # Add your API keys
   ```

---

## 🎯 Code of Conduct

- **Be respectful** — All contributors are valued
- **Be constructive** — Provide helpful feedback
- **Be inclusive** — Welcome diverse perspectives
- **Report issues professionally** — Use GitHub issues for bugs

---

## 🔄 Development Workflow

### 1. Create a Feature Branch
```bash
# Update main
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feature/your-feature-name
# or for bug fixes:
git checkout -b fix/bug-description
# or for documentation:
git checkout -b docs/documentation-update
```

### 2. Make Changes
- Edit code following our Coding Standards
- Commit frequently with clear messages
- Test your changes locally

### 3. Push to Your Fork
```bash
git push origin feature/your-feature-name
```

### 4. Create Pull Request
- Go to the original repo
- Click "New Pull Request"
- Select your branch
- Fill in the PR template

---

## 📝 Commit Message Guidelines

### Format
```
<type>: <subject>

<body>

<footer>
```

### Type (required)
- `Add` — Adding a new feature
- `Fix` — Bug fix
- `Update` — Changing existing functionality
- `Remove` — Removing code or features
- `Docs` — Documentation updates
- `Chore` — Build process, dependencies, tooling
- `Refactor` — Code restructuring without feature change
- `Test` — Adding or updating tests

### Subject (required)
- Use imperative mood ("Add" not "Added")
- Don't capitalize first letter
- No period at the end
- Maximum 50 characters

### Examples
```
Add: Firebase authentication module

Implement Firebase Authentication with email/password login.
Add sign-up and password reset screens.

Fixes #89
```

```
Fix: crash when mascot mood is null

Check for null before accessing mood enum.

Fixes #42
```

---

## 🎨 Coding Standards

### Kotlin Style
- Follow Kotlin Style Guide
- Use meaningful variable and function names
- Prefer `val` over `var`

### Naming Conventions
```kotlin
class UserRepository
object AppConstants

fun calculateXpReward()
fun isUserPremium()

const val MIN_PASSWORD_LENGTH = 8
```

---

## ✅ Pull Request Process

### Before Submitting
- [ ] Code follows style guidelines
- [ ] All tests pass locally
- [ ] Lint passes
- [ ] Commit messages follow guidelines
- [ ] Documentation is updated
- [ ] No unnecessary files committed

### PR Description Template
```markdown
## Description
Brief overview of changes

## Related Issues
Fixes #123

## Changes
- Change 1
- Change 2

## Testing
How to test locally

## Screenshots (if UI changes)
[Add screenshots]

## Checklist
- [ ] Code follows style guidelines
- [ ] Tests written and passing
- [ ] Documentation updated
```

---

## 🧪 Testing

### Run Tests Locally
```bash
# Unit tests
./gradlew test

# Instrumented tests
./gradlew connectedAndroidTest

# Coverage report
./gradlew testDebugUnitTestCoverage
```

---

## 📚 Resources

- [Kotlin Documentation](https://kotlinlang.org/)
- [Android Jetpack Compose](https://developer.android.com/compose)
- [Firebase Documentation](https://firebase.google.com/docs)
- [Hilt Dependency Injection](https://developer.android.com/training/dependency-injection/hilt-android)

---

## 🎉 Thank You!

Your contributions help make Learn With Velmorth better. We appreciate your effort!

**Happy coding!** 🌿
