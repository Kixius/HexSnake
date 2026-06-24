import { PALETTE } from '../../../config';
import { FONT } from '../../paint';
import { settingsStore } from '../../../settings/SettingsStore';
import { backButton, label, screenTitle, slider, toggle } from '../widgets';
import type { Screen } from '../types';

/** Music settings: music volume slider, mute toggle, SFX toggle. Writes through
 *  to the settings store; AudioManager applies it live via the store subscription. */
export const musicScreen: Screen = {
  render(ctx, ui, api, w, h) {
    screenTitle(ctx, w, h, 'MUSIC', 'volume · mute · sound effects');

    const audio = settingsStore.audio;
    const colW = Math.min(420, w * 0.6);
    const x = (w - colW) / 2;
    let y = h * 0.3;

    // Music volume.
    label(ctx, x, y - 8, 'MUSIC VOLUME', { color: PALETTE.text, font: `bold 15px ${FONT}` });
    label(ctx, x + colW - 60, y - 8, `${Math.round(audio.musicVolume * 100)}%`, {
      color: PALETTE.textDim,
      font: `15px ${FONT}`,
      align: 'right',
    });
    const v = slider(ctx, ui, { id: 'mus.vol', x, y: y + 16, w: colW, value: audio.musicVolume, min: 0, max: 1 });
    if (Math.abs(v - audio.musicVolume) > 1e-6) settingsStore.setAudio({ musicVolume: v });
    y += 70;

    // Mute.
    const muted = toggle(ctx, ui, { id: 'mus.mute', x, y, w: colW, label: 'MUTE ALL', value: audio.muted });
    if (muted !== audio.muted) settingsStore.setAudio({ muted });
    y += 56;

    // SFX.
    const sfx = toggle(ctx, ui, { id: 'mus.sfx', x, y, w: colW, label: 'SOUND EFFECTS', value: audio.sfxEnabled });
    if (sfx !== audio.sfxEnabled) settingsStore.setAudio({ sfxEnabled: sfx });

    if (backButton(ctx, ui, w, h)) api.pop();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  },
};
