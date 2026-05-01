import React, { Component, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SIZES, SPACING, BORDER_RADIUS } from '@/constants/theme';
import { i18n } from '@/i18n/translations';
import { supabase } from '@/services/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logOperationalError } from '@/utils/observability';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // P2-C Phase 2 — passe par `logOperationalError` qui filtre les patterns
    // sensibles (token, password, jwt, ...) avant écriture en logs.
    logOperationalError('[ErrorBoundary] Caught error', error, {
      component_stack: errorInfo.componentStack ?? null,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  handleLogout = async () => {
    try {
      await AsyncStorage.multiRemove([
        'supabase.auth.token',
        '@supabase.auth.token',
      ]);

      // Logout local en best-effort depuis l'ErrorBoundary (le contexte
      // d'erreur peut empêcher un signOut global propre côté serveur).
      await supabase.auth.signOut({ scope: 'local' });

      this.setState({
        hasError: false,
        error: null,
      });

      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    } catch (error) {
      logOperationalError('[ErrorBoundary] Emergency logout failed', error);

      this.setState({
        hasError: false,
        error: null,
      });
    }
  };

  render() {
    if (this.state.hasError) {
      const title = String(i18n.t('components.error_boundary.title'));
      const message = String(i18n.t('components.error_boundary.message'));
      const retryLabel = String(i18n.t('components.error_boundary.retry'));
      const logoutLabel = String(i18n.t('components.error_boundary.logout'));

      return (
        <View style={styles.container}>
          <View style={styles.content}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{message}</Text>
            {__DEV__ && this.state.error && (
              <View style={styles.errorDetails}>
                <Text style={styles.errorText}>
                  {this.state.error.toString()}
                </Text>
              </View>
            )}
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={styles.button}
                onPress={this.handleReset}
              >
                <Text style={styles.buttonText}>{retryLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.logoutButton]}
                onPress={this.handleLogout}
              >
                <Text style={styles.buttonText}>{logoutLabel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.page,
  },
  content: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.card,
    padding: SPACING.xl,
    alignItems: 'center',
    maxWidth: 400,
    width: '100%',
  },
  title: {
    fontSize: SIZES.xxxl,
    fontWeight: 'bold',
    color: COLORS.error,
    marginBottom: SPACING.md,
  },
  message: {
    fontSize: SIZES.md,
    color: COLORS.primaryText,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  errorDetails: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    width: '100%',
  },
  errorText: {
    fontSize: SIZES.sm,
    color: COLORS.error,
    fontFamily: 'monospace',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: SPACING.md,
    width: '100%',
    justifyContent: 'center',
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    flex: 1,
    alignItems: 'center',
  },
  logoutButton: {
    backgroundColor: COLORS.error,
  },
  buttonText: {
    fontSize: SIZES.md,
    fontWeight: '600',
    color: COLORS.white,
  },
});
