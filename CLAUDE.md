# PokerTexasHoldem — Claude Code Instructions

## Project Summary
Multiplayer Texas Hold'em poker app built with **React Native 0.84.1 + TypeScript** and **Supabase** for real-time multiplayer state. No Redux/Zustand — all game state lives in Supabase and is synced via real-time subscriptions.

## Commands
- **Build**: Open `ios/PokerTexasHoldem.xcworkspace` in Xcode → select device → ⌘R
- **Physical device**: Bondith (iPhone 16 Pro Max) — use Xcode, not CLI (`run-ios --device` is unreliable)
- **Test**: `npm test`
- **Lint**: `npm run lint`
- **Type check**: `npx tsc --noEmit`

## Key Directories
```
src/
  screens/    — HomeScreen, LobbyScreen, GameScreen
  components/ — Card, PlayerSeat, TurnTimer, ActionButtons, CommunityCards, PotDisplay
  engine/     — gameLogic.ts, handEvaluator.ts, deck.ts
  lib/        — supabase.ts (Supabase client, reads from @env)
  types/      — env.d.ts (@env type declarations)
supabase/
  schema.sql  — Source of truth for DB columns and enums
ios/          — Xcode project + CocoaPods
```

## Database (Supabase)
Tables: `rooms`, `players`. See `supabase/schema.sql` for all columns.
**Always check schema.sql before writing player/room updates** — sending unknown columns causes silent failures.

Key column: `acted_seats` (jsonb) is on the `rooms` table — tracks which seat indices have acted this street. It is NOT a player-level column.

## Code Conventions
- All React components wrapped in `React.memo`
- All `useMemo`/`useCallback`/`useState` hooks must appear **before** any conditional returns
- `applyBet` / `applyFold` return `{playerUpdate, roomUpdate}` — callers write to Supabase
- Only the host executes `checkAdvanceStreet()` to avoid race conditions
- Supabase subscriptions are debounced 80ms to batch rapid events
- Credentials are in `.env` (gitignored); loaded via `react-native-dotenv` as `@env`

## Agent Routing
| Task | Agent to use |
|------|-------------|
| Explore / search codebase | `Explore` subagent |
| Bug investigation | `oh-my-claudecode:debugger` |
| Multi-file feature work | `oh-my-claudecode:executor` (use `model=opus` for complex work) |
| Code review | `oh-my-claudecode:code-reviewer` |
| Planning a feature | `oh-my-claudecode:plan` |
| Security review | `oh-my-claudecode:security-reviewer` |

## GitHub
Repo: https://github.com/Bsovann/PokerTexasHoldem (push uses gh auth token in remote URL)
