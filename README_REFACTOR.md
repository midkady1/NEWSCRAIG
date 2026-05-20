# NEWSCRAIG PRO Refactor

## Added

- Modular architecture
- Logger system
- RSS service isolation
- Gemini service abstraction
- Dedupe engine
- Rule engine
- Config layer
- .env support
- Confidence scoring
- Production-ready folder structure

## New Structure

src/
  config/
  services/
  engine/
  utils/
  telegram/
  feeds/
  storage/
  prompts/

## Legacy

Original bot preserved:
src/legacy.bot.js
