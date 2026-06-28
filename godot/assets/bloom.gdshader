shader_type canvas_item;
// Smooth 2D bloom (Gaussian). On a fullscreen ColorRect in a CanvasLayer above the game.
// Reads SCREEN_TEXTURE, keeps only the bright pixels (threshold), Gaussian-blurs them
// with DENSE 1px sampling (no spread -> no undersampling -> no streaks), adds them back.
//
// Tuning:
//   threshold — raise so only the bright bits (snake head, essence, portal, title) bloom.
//   radius    — bloom halo size in px (larger = wider, heavier).
//   sigma     — Gaussian falloff (larger = softer/wider core).
//   intensity — bloom brightness.
uniform float threshold : hint_range(0.0, 2.0) = 0.3;
uniform float intensity : hint_range(0.0, 4.0) = 1.6;
uniform float radius   : hint_range(2.0, 8.0) = 8;   // bloom halo radius in pixels
uniform float sigma    : hint_range(1.0, 10.0) = 10;  // Gaussian falloff
uniform sampler2D SCREEN_TEXTURE : hint_screen_texture, filter_linear_mipmap;

void fragment() {
	vec2 px = SCREEN_PIXEL_SIZE;
	float s2 = 2.0 * sigma * sigma;
	const int R = 8;  // max kernel extent (constant loop bound; radius caps the rest)
	vec3 sum = vec3(0.0);
	float wsum = 0.0;
	for (int x = -R; x <= R; x++) {
		for (int y = -R; y <= R; y++) {
			vec2 off = vec2(float(x), float(y));
			if (length(off) > radius) {
				continue;  // outside the bloom radius
			}
			float w = exp(-dot(off, off) / s2);  // Gaussian weight (smooth falloff)
			vec3 s = texture(SCREEN_TEXTURE, SCREEN_UV + off * px).rgb;
			float lum = max(s.r, max(s.g, s.b));
			sum += s * smoothstep(threshold, threshold + 0.3, lum) * w;  // keep only bright
			wsum += w;
		}
	}
	sum /= wsum;
	float a = max(sum.r, max(sum.g, sum.b));
	COLOR = vec4(sum * intensity, a * intensity);
}
