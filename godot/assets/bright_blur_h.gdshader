shader_type canvas_item;
// Bloom pass 1 (runs in a HALF-RES SubViewport): take the EMISSIVE layer (which paints
// ONLY the bloomable elements on black), keep non-black pixels, apply a horizontal
// Gaussian blur. Low threshold since the emissive layer is already selective.
uniform float threshold : hint_range(0.0, 2.0) = 0.05;
uniform float sigma : hint_range(1.0, 12.0) = 3.0;
uniform sampler2D emissive_tex : filter_linear_mipmap, repeat_disable;

void fragment() {
	float s2 = 2.0 * sigma * sigma;
	vec3 sum = vec3(0.0);
	float wsum = 0.0;
	const int R = 12;  // 25 horizontal taps (constant bound for the shader loop)
	for (int x = -R; x <= R; x++) {
		float fx = float(x);
		float w = exp(-(fx * fx) / s2);  // Gaussian weight
		vec2 uv = SCREEN_UV + vec2(fx, 0.0) * SCREEN_PIXEL_SIZE;
		vec3 s = texture(emissive_tex, uv).rgb;
		float lum = max(s.r, max(s.g, s.b));
		sum += s * smoothstep(threshold, threshold + 0.3, lum) * w;  // keep non-black
		wsum += w;
	}
	sum /= wsum;
	COLOR = vec4(sum, 1.0);
}
