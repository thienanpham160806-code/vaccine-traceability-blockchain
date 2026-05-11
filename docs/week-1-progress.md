# Week 1 Progress

## Day 1 - Project Setup

### Completed

- Created GitHub repository
- Cloned repository to local machine
- Installed Git, Node.js dependencies, and Hardhat
- Initialized Hardhat TypeScript project
- Fixed dependency conflict between Hardhat versions
- Configured npm scripts
- Fixed TypeScript test configuration
- Restructured the repository into a monorepo format
- Moved the Hardhat project into `smart-contract/`
- Added placeholder folders for `backend/`, `frontend/`, and `report/`
- Removed generated Hardhat folders from Git tracking:
  - `artifacts/`
  - `cache/`
  - `typechain-types/`

### Commands Verified

```bash
cd smart-contract
npm install
npm run compile
npm run test

