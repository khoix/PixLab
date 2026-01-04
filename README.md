# Pixel Labyrinth

A pixel-art cyberpunk mythology roguelike maze crawler. Navigate procedurally generated mazes, battle mythological bosses like Zeus, Hades, and Ares, collect legendary weapons and armor, and progress through endless levels. Features mobile-friendly touch controls, inventory management, and a compendium system to track defeated enemies.

## Features

- **Procedurally Generated Mazes**: Each level features a unique maze layout with enemies, items, and challenges
- **Mythological Boss Battles**: Face off against powerful bosses inspired by Greek mythology (Zeus, Hades, Ares) every 8 levels
- **Item System**: Collect and equip weapons, armor, and utility items with varying rarities (Common, Rare, Epic, Legendary)
- **Roguelike Progression**: Endless levels with increasing difficulty and scaling enemy stats
- **Mobile-Friendly Controls**: Multiple control schemes including virtual joystick, directional pad, and touchpad
- **Compendium System**: Track and view information about defeated enemies
- **Shop System**: Purchase items and upgrades between levels
- **Inventory Management**: Manage your loadout with weapon, armor, and utility slots
- **Pixel Art Aesthetic**: Retro-inspired visuals with a cyberpunk twist

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS, PostCSS
- **UI Components**: Radix UI primitives
- **State Management**: Custom React context/store
- **Routing**: Wouter
- **Backend**: Express.js (optional server component)
- **Database**: PostgreSQL with Drizzle ORM (if using server features)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd pixlab
```

2. Install dependencies:
```bash
npm install
```

3. (Optional) Set up environment variables for server features:
```bash
# Create a .env file if using database features
DATABASE_URL=your_database_url
```

## Running the Application

### Development Mode

Run the client in development mode:
```bash
npm run dev:client
```

The app will be available at `http://localhost:5000`

To run with the server:
```bash
npm run dev
```

### Production Build

Build for production:
```bash
npm run build
```

Start the production server:
```bash
npm start
```

## Gameplay

### Controls

**Desktop:**
- Arrow keys or WASD: Move
- Mouse: Navigate UI

**Mobile:**
- Virtual Joystick: Analog movement control
- Directional Pad: 4-directional movement
- Touchpad: Touch-based directional control (tap top/bottom/left/right regions)

### Game Mechanics

- **Movement**: Turn-based movement through maze corridors
- **Combat**: Auto-attack nearby enemies when equipped with a weapon
- **Level Progression**: Find the exit to advance to the next level
- **Boss Fights**: Encounter powerful bosses every 8 levels
- **Shop Visits**: Visit shops every 5 levels (when not a boss level) to purchase items
- **Item Rarity**: Items come in four rarities affecting their stat bonuses
- **Scaling**: Enemy difficulty and item power scale with level progression

### Boss Types

- **Zeus Mainframe**: Ranged attacker with projectile attacks
- **Hades Core**: Phasing enemy that can move through walls
- **Ares Protocol**: Melee charger with fast movement

## Project Structure

```
pixlab/
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/     # React components
│   │   │   ├── game/       # Game-specific components
│   │   │   └── ui/         # UI primitives
│   │   ├── lib/            # Core game logic and utilities
│   │   │   └── game/       # Game engine, types, constants
│   │   ├── pages/          # Page components
│   │   └── styles/         # CSS styles
│   └── public/             # Static assets
├── server/                 # Express server (optional)
├── script/                 # Build scripts
└── shared/                 # Shared types/schemas
```

## Development

### Type Checking

```bash
npm run check
```

### Database Migrations

If using database features:
```bash
npm run db:push
```

## License

MIT

