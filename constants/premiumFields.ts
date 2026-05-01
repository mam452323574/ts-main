/**
 * Premium Fields Configuration
 * Defines which fields are locked for free users in each scan type
 */

export const PREMIUM_LOCKED_FIELDS: Record<'body' | 'face' | 'nutrition', string[]> = {
    body: ['body_fat_percentage', 'posture_score', 'body_symmetry'],
    face: ['skin_quality_score', 'energy_score', 'collagen_level'],
    nutrition: ['glycemic_index_label', 'main_vitamins'],
};

/**
 * Check if a specific field should be locked for the current user
 * @param scanType - The type of scan (body, face, nutrition)
 * @param fieldKey - The field key to check
 * @param isPremium - Whether the user has premium access
 * @returns true if the field should be locked (blurred)
 */
export const isFieldLocked = (
    scanType: 'body' | 'face' | 'nutrition',
    fieldKey: string,
    isPremium: boolean
): boolean => {
    if (isPremium) return false;
    return PREMIUM_LOCKED_FIELDS[scanType]?.includes(fieldKey) ?? false;
};
