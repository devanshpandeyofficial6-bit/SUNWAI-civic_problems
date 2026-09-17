# Contributing to SUNWAI

Thank you for your interest in contributing to **SUNWAI**! We welcome contributions from developers, civic hackers, GIS specialists, and AI researchers.

---

## Code of Conduct

Please be respectful, collaborative, and constructive when interacting with the project and fellow contributors.

---

## Getting Started

1. **Fork the repository** on GitHub.
2. **Clone your fork**:
   ```bash
   git clone https://github.com/<your-username>/sunwai.git
   cd sunwai
   ```
3. **Run the local development server**:
   ```bash
   # Run Node.js core backend & frontend
   npm start

   # (Optional) Run the AI inference microservice in a separate terminal:
   npm run ai:install
   npm run ai:start
   ```
4. **Run tests**:
   ```bash
   npm test
   ```

---

## Branching & Commit Guidelines

- Branch names should follow standard conventions:
  - `feat/feature-name`
  - `fix/bug-description`
  - `docs/documentation-update`
  - `refactor/code-improvement`
- Write clear, imperative commit messages:
  - `feat: add WhatsApp webhook ingestion`
  - `fix: correct bounding box offset on mobile retina screens`
  - `docs: update deployment instructions for AWS App Runner`

---

## Submitting a Pull Request

1. Make sure tests pass locally: `npm test`
2. Ensure your changes adhere to code style: `npm run lint`
3. Push to your fork and submit a PR against `main`.
4. Provide a clear PR description explaining what was changed and how to test it.
