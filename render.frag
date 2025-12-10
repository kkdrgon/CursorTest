#version 300 es
precision highp float;

in vec3 vTexCoord; // xy: atlas UV, z: misc flag (1.0 default)

uniform sampler2D u_texture; // atlas / sprite sheet
uniform vec4 u_tint; // optional tint (default vec4(1.0))
uniform float u_brightness; // optional brightness multiplier (default 1.0)

out vec4 fragColor;

void main() {
	// Sample the atlas
	vec2 uv = vTexCoord.xy;

	// Use standard bilinear filtering for smooth sprites; but nearest will be used
	// if atlas is set to NEAREST in GL state. We rely on the GL texture params.
	vec4 src = texture(u_texture, uv);

	// Discard fully transparent pixels to avoid quad corners showing
	if (src.a < 0.01) {
		discard;
	}

	// Apply tint and brightness
	vec3 color = src.rgb * u_tint.rgb * u_brightness;
	float alpha = src.a * u_tint.a;

	// Optional simple highlight: if vTexCoord.z > 1.5, slightly brighten
	if (vTexCoord.z > 1.5) {
		color = color * 1.12 + vec3(0.03);
	}

	fragColor = vec4(color, alpha);
}

