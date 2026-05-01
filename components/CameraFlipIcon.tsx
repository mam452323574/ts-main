import React from 'react';
import { View, StyleSheet } from 'react-native';
import { RefreshCcw, Camera } from 'lucide-react-native';

interface CameraFlipIconProps {
    size?: number;
    color?: string;
    strokeWidth?: number;
}

/**
 * Composite icon for Camera Flip action.
 * Consists of rotating arrows (RefreshCcw) surrounding a small camera glyph.
 */
export const CameraFlipIcon: React.FC<CameraFlipIconProps> = ({
    size = 28,
    color = '#FFFFFF',
    strokeWidth = 2.5,
}) => {
    // Arrow size is the base size
    const arrowSize = size;

    // Camera size is roughly half the arrow size to fit inside
    const cameraSize = size * 0.45;

    // Stroke width for the inner camera should be slightly thinner for detail
    const cameraStrokeWidth = strokeWidth * 0.8;

    return (
        <View style={[styles.container, { width: size, height: size }]}>
            {/* Outer Rotating Arrows */}
            <RefreshCcw
                size={arrowSize}
                color={color}
                strokeWidth={strokeWidth}
                style={styles.arrows}
            />

            {/* Inner Camera Glyph */}
            <View style={styles.cameraContainer}>
                <Camera
                    size={cameraSize}
                    color={color}
                    strokeWidth={cameraStrokeWidth}
                    fill={color} // Optional: fill the camera to make it solid like Instagram
                    style={{ opacity: 0.9 }}
                />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    arrows: {
        position: 'absolute',
    },
    cameraContainer: {
        position: 'absolute',
        justifyContent: 'center',
        alignItems: 'center',
        // Fine-tune centering if needed
    },
});
