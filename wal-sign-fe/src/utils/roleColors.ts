const ROLE_COLORS = ['#7c3aed', '#0891b2', '#d97706', '#16a34a', '#db2777', '#4f46e5'];

/** Stable colour for a template role, used for its fields and legend */
export const roleColor = (role: number) => ROLE_COLORS[role % ROLE_COLORS.length];
