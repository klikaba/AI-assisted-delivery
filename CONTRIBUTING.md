# Contributing to Agency Platform

Thank you for your interest in contributing! This document provides guidelines for contributing to the Agency Platform project.

## How to Contribute

### Reporting Issues

- Use GitHub Issues to report bugs, suggest features, or ask questions
- Check existing issues before creating a new one
- Provide clear descriptions and reproduction steps for bugs
- Include environment details (OS, Node version, etc.)

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Run tests: `npm test`
5. Commit with clear messages
6. Open a Pull Request

### Code Style

- Follow existing code conventions (CommonJS modules)
- Keep functions focused and well-structured
- Add comments only when necessary to explain *why*, not *what*

### Testing

- Run the full test suite before submitting: `npm test`
- Profile conformance tests: `./.agency/bin/agency test --profile <profile-path>`
- If adding new simulated flows, update trace snapshots: `npm run test:update-traces`

### Documentation

- Update README.md if adding new features
- Keep inline documentation minimal but clear
- Update CHANGELOG.md with your changes

## Development Setup

```bash
# Clone your fork
git clone https://github.com/klikaba/AI-assisted-delivery.git
cd AI-assisted-delivery

# Install dependencies (if any)
npm install

# Run tests
npm test

# Generate config
node scripts/config.js --generate
```

## Areas We Need Help

- **New adapters:** Additional trackers (SaaS/on-prem), SCMs (GitLab, Bitbucket)
- **UX improvements:** "What's next" queue views, structured linking of Spec/Plan/PR evidence
- **Governance:** Machine-verifiable gates and artifacts across providers
- **Testing:** More profile conformance tests and edge case coverage

## Code of Conduct

Please note that this project is released with a [Code of Conduct](CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.

## License

By contributing, you agree that your contributions will be licensed under the Apache License, Version 2.0.
