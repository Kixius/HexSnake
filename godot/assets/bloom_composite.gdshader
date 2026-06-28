shader_type canvas_item;
render_mode blend_add;  // add the bloom over the game (drawn below this on the root canvas)
// Final composite: the half-res blurred bloom, upscaled to fullscreen (linear filter ->
// soft) and added back over the game. Tune `intensity` for bloom brightness.
uniform float intensity : hint_range(0.0, 4.0) = 0.8;
uniform sampler2D bloom_tex : filter_linear_mipmap, repeat_disable;

void fragment() {
	COLOR = vec4(texture(bloom_tex, UV).rgb * intensity, 1.0);
}
