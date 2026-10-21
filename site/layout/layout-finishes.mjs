// Stable version-1 layout JSON contract. No renderer or browser dependencies.
// room.appearance, when present, contains exactly one wall and one floor value.
export const WALL_FINISHES = Object.freeze(['paint', 'linen', 'stripe']);
export const FLOOR_FINISHES = Object.freeze(['oak', 'concrete', 'tile']);
export const DEFAULT_ROOM_APPEARANCE = Object.freeze({wall: 'paint', floor: 'oak'});
