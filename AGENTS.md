# AGENTS.md — PokerTexasHoldem Codebase Map

Quick reference for Claude Code subagents. Read this before exploring the codebase.

## Project
React Native multiplayer Texas Hold'em. Supabase handles all real-time game state. TypeScript throughout. No local state management library.

## Critical Files

| File | Purpose |
|------|---------|
| `src/engine/gameLogic.ts` | All game logic: `initializeGame`, `applyBet`, `applyFold`, `shouldAdvanceStreet`, `advanceStreet`, `resolveShowdown` |
| `src/engine/handEvaluator.ts` | Best 5-card hand from 7 cards, winner determination |
| `src/engine/deck.ts` | 52-card deck creation, Fisher-Yates shuffle |
| `src/lib/supabase.ts` | Supabase client (reads URL + key from `@env`) |
| `src/screens/GameScreen.tsx` | Main game UI, Supabase subscriptions, all action handlers |
| `src/screens/LobbyScreen.tsx` | Waiting room, host starts game via `initializeGame` |
| `src/screens/HomeScreen.tsx` | Create/join room, session token management |
| `src/components/Card.tsx` | Card render with flip animation (Animated.spring) |
| `src/components/PlayerSeat.tsx` | Player avatar, current turn highlight, turn timer |
| `src/components/TurnTimer.tsx` | 30s countdown bar (green→red), calls `onTimeout` |
| `src/components/ActionButtons.tsx` | Fold / Check / Call / Raise / All-In |
| `src/components/CommunityCards.tsx` | 5-slot community card display |
| `src/components/PotDisplay.tsx` | Pot total + round name |
| `supabase/schema.sql` | **Source of truth** for all DB columns and enums |
| `ios/PokerTexasHoldem/Info.plist` | App config — locked to landscape orientation |
| `babel.config.js` | Configured with `react-native-dotenv` for `@env` module |

## Database Schema

### rooms table
```
id, code, status (room_status), community_cards (jsonb), deck (jsonb),
pot, current_round (round_type), current_player_seat, dealer_seat,
small_blind, big_blind, min_raise, acted_seats (jsonb), created_at
```

### players table
```
id, room_id, nickname, seat_index, chips, hole_cards (jsonb),
current_bet, total_bet_this_round, status (player_status),
is_host, session_token, created_at
```

### Enums
- `room_status`: `waiting | playing | finished | ended`
- `player_status`: `waiting | active | folded | all_in | out | left`
- `round_type`: `preflop | flop | turn | river | showdown`

## Game Flow
```
LobbyScreen (host clicks Start)
  → initializeGame() writes hole cards + room state to Supabase
  → room.status = 'playing' triggers all clients to navigate to GameScreen
  → GameScreen subscribes to rooms + players changes (debounced 80ms)
  → Players take turns: applyFold / applyBet updates Supabase
  → Host runs checkAdvanceStreet() after each action
  → advanceStreet() deals community cards, resets acted_seats
  → resolveShowdown() finds winners, awards pot
  → resetForNextHand() re-deals after 3s celebration
```

## Key Patterns
- `acted_seats[]` on `rooms` tracks who has acted this street — NOT a per-player column
- Only the **host** runs `checkAdvanceStreet()` to avoid race conditions
- `applyBet(state, playerId, additionalAmount)` — amount is ADDITIONAL chips, not total
- `applyFold` / `applyBet` both return `{ playerUpdate, roomUpdate }` — callers write to Supabase separately
- All UI components use `React.memo`
- All hooks (`useMemo`, `useCallback`, `useState`) must be declared before any conditional returns
- Supabase subscriptions fire on INSERT/UPDATE — `fetchState()` re-fetches all 3 queries each time

## Common Pitfalls
1. **Silent DB failures**: Sending a column that doesn't exist in Supabase causes the whole update to fail silently. Always verify against `supabase/schema.sql` before writing update payloads.
2. **Hooks order**: Never put `useMemo`/`useCallback` after an `if (!room || !myPlayer) return` guard.
3. **Dynamic require**: Never use `require()` inside render functions — use static imports at the top.
4. **CLI device targeting**: `npx react-native run-ios --device` doesn't reliably detect the physical device. Use Xcode directly.
