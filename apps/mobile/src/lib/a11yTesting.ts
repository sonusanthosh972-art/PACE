// A11y testing suite for PACE

export interface A11yTestResult {
  passed: boolean;
  issues: A11yIssue[];
}

export interface A11yIssue {
  level: 'error' | 'warning' | 'info';
  message: string;
  suggestion: string;
  componentName?: string;
}

/**
 * Accessibility Testing Suite for PACE
 * Tests for WCAG 2.1 compliance
 */
export class A11yTestSuite {
  private issues: A11yIssue[] = [];

  /**
   * Test 1: Minimum touch target size (48x48pt)
   */
  testTouchTargetSize(width: number, height: number, componentName?: string): void {
    const MIN_SIZE = 48;
    if (width < MIN_SIZE || height < MIN_SIZE) {
      this.issues.push({
        level: 'error',
        message: `Touch target too small: ${width}x${height}pt (minimum: ${MIN_SIZE}x${MIN_SIZE}pt)`,
        suggestion: `Increase touch target size to at least ${MIN_SIZE}x${MIN_SIZE}pt for accessibility`,
        componentName,
      });
    }
  }

  /**
   * Test 2: Color contrast ratio (WCAG AA: 4.5:1 for text)
   */
  testColorContrast(foreground: string, background: string, componentName?: string): void {
    const ratio = calculateContrastRatio(foreground, background);
    const MIN_RATIO = 4.5;

    if (ratio < MIN_RATIO) {
      this.issues.push({
        level: 'error',
        message: `Insufficient color contrast: ${ratio.toFixed(2)}:1 (minimum: ${MIN_RATIO}:1)`,
        suggestion: `Adjust colors to achieve at least ${MIN_RATIO}:1 contrast ratio for text`,
        componentName,
      });
    }
  }

  /**
   * Test 3: Check for text size accessibility
   */
  testTextSize(fontSize: number, componentName?: string): void {
    const MIN_FONT_SIZE = 12;
    if (fontSize < MIN_FONT_SIZE) {
      this.issues.push({
        level: 'warning',
        message: `Text size too small: ${fontSize}pt (recommended: ${MIN_FONT_SIZE}pt minimum)`,
        suggestion: `Increase font size to at least ${MIN_FONT_SIZE}pt`,
        componentName,
      });
    }
  }

  /**
   * Test 4: Check for proper spacing (minimum 8pt between interactive elements)
   */
  testInteractiveElementSpacing(spacing: number, componentName?: string): void {
    const MIN_SPACING = 8;
    if (spacing < MIN_SPACING) {
      this.issues.push({
        level: 'warning',
        message: `Insufficient spacing: ${spacing}pt (minimum: ${MIN_SPACING}pt)`,
        suggestion: `Increase spacing between interactive elements to ${MIN_SPACING}pt`,
        componentName,
      });
    }
  }

  /**
   * Test 5: Check for accessible labels
   */
  testAccessibleLabel(hasLabel: boolean, componentName?: string): void {
    if (!hasLabel) {
      this.issues.push({
        level: 'error',
        message: 'Missing accessible label',
        suggestion: `Add accessibilityLabel prop to make the component accessible to screen readers`,
        componentName,
      });
    }
  }

  /**
   * Test 6: Check for proper heading hierarchy
   */
  testHeadingHierarchy(level: number, previousLevel: number, componentName?: string): void {
    // Heading levels should not skip (e.g., H1 -> H3)
    if (previousLevel !== 0 && level > previousLevel + 1) {
      this.issues.push({
        level: 'warning',
        message: `Heading hierarchy skipped: H${previousLevel} -> H${level}`,
        suggestion: `Use proper heading hierarchy without skipping levels`,
        componentName,
      });
    }
  }

  /**
   * Test 7: Check for keyboard navigation support
   */
  testKeyboardNavigation(isKeyboardAccessible: boolean, componentName?: string): void {
    if (!isKeyboardAccessible) {
      this.issues.push({
        level: 'error',
        message: 'Component not keyboard accessible',
        suggestion: `Ensure all interactive elements are accessible via keyboard navigation`,
        componentName,
      });
    }
  }

  /**
   * Test 8: Check for animation motion sensitivity
   */
  testAnimationMotion(
    hasMotion: boolean,
    respectsReducedMotion: boolean,
    componentName?: string,
  ): void {
    if (hasMotion && !respectsReducedMotion) {
      this.issues.push({
        level: 'warning',
        message: 'Animation does not respect reduced motion preference',
        suggestion: `Use useReducedMotion hook to respect system reduce-motion preference`,
        componentName,
      });
    }
  }

  /**
   * Test 9: Check for proper focus management
   */
  testFocusManagement(focusable: boolean, componentName?: string): void {
    if (!focusable) {
      this.issues.push({
        level: 'warning',
        message: 'Component may not have proper focus management',
        suggestion: `Ensure interactive elements have proper focus handling with onFocus/onBlur`,
        componentName,
      });
    }
  }

  /**
   * Test 10: Check for error messages accessibility
   */
  testErrorAccessibility(
    errorAnnounced: boolean,
    errorRole: boolean,
    componentName?: string,
  ): void {
    if (!errorAnnounced || !errorRole) {
      this.issues.push({
        level: 'error',
        message: 'Error messages not properly announced to screen readers',
        suggestion: `Use accessibilityRole="alert" and AccessibilityInfo.announceForAccessibility()`,
        componentName,
      });
    }
  }

  /**
   * Get all issues
   */
  getIssues(): A11yIssue[] {
    return this.issues;
  }

  /**
   * Get issues by level
   */
  getIssuesByLevel(level: 'error' | 'warning' | 'info'): A11yIssue[] {
    return this.issues.filter((issue) => issue.level === level);
  }

  /**
   * Get test results
   */
  getResults(): A11yTestResult {
    const errors = this.getIssuesByLevel('error');
    return {
      passed: errors.length === 0,
      issues: this.issues,
    };
  }

  /**
   * Clear issues
   */
  clear(): void {
    this.issues = [];
  }

  /**
   * Generate report
   */
  generateReport(): string {
    const errors = this.getIssuesByLevel('error');
    const warnings = this.getIssuesByLevel('warning');

    return `
=== Accessibility Test Report ===
Total Issues: ${this.issues.length}
Errors: ${errors.length}
Warnings: ${warnings.length}

${errors.length > 0 ? `\nErrors:\n${errors.map((i) => `- ${i.message}\n  Component: ${i.componentName || 'Unknown'}\n  Suggestion: ${i.suggestion}`).join('\n')}` : ''}

${warnings.length > 0 ? `\nWarnings:\n${warnings.map((i) => `- ${i.message}\n  Component: ${i.componentName || 'Unknown'}\n  Suggestion: ${i.suggestion}`).join('\n')}` : ''}
`;
  }
}

/**
 * Helper: Calculate contrast ratio between two colors
 */
function calculateContrastRatio(foreground: string, background: string): number {
  const fgLum = getRelativeLuminance(foreground);
  const bgLum = getRelativeLuminance(background);
  const lighter = Math.max(fgLum, bgLum);
  const darker = Math.min(fgLum, bgLum);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Helper: Get relative luminance (WCAG standard)
 */
function getRelativeLuminance(hex: string): number {
  const rgb = parseInt(hex.slice(1), 16);
  const r = ((rgb >> 16) & 0xff) / 255;
  const g = ((rgb >> 8) & 0xff) / 255;
  const b = ((rgb >> 0) & 0xff) / 255;

  const luminances = [r, g, b].map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );
  const [rs, gs, bs] = luminances;

  return 0.2126 * (rs || 0) + 0.7152 * (gs || 0) + 0.0722 * (bs || 0);
}

// Global instance for testing
export const a11yTester = new A11yTestSuite();
