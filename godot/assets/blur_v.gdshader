shader_type canvas_item;
// Bloom pass 2 (HALF-RES SubViewport): vertical Gaussian blur of pass 1's output.
// Together with pass 1 this is a separable 2D Gaussian (cheap + smooth, no streaks).
uniform float sigma : hint_range(1.0, 12.0) = 3.0;
uniform sampler2D blur_h_tex : filter_linear_mipmap, repeat_disable;

void fragment() {
	float s2 = 2.0 * sigma * sigma;
	vec3 sum = vec3(0.0);
	float wsum = 0.0;
	const int R = 12;
	for (int y = -R; y <= R; y++) {
		float fy = float(y);
		float w = exp(-(fy * fy) / s2);
		vec2 uv = SCREEN_UV + vec2(0.0, fy) * SCREEN_PIXEL_SIZE;
		sum += texture(blur_h_tex, uv).rgb * w;
		wsum += w;
	}
	sum /= wsum;
	COLOR = vec4(sum, 1.0);
}
