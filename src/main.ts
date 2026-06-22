import { Game } from './game/Game';

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (!canvas) throw new Error('HexSnake: #game canvas not found');

const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('HexSnake: 2D context unavailable');

const game = new Game(canvas, ctx);
game.start();
