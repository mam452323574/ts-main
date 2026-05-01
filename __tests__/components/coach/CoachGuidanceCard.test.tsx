import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { CoachGuidanceCard } from '@/components/coach/CoachGuidanceCard';

const LONG_BODY = [
  'Premier paragraphe de guidance avec assez de contexte pour depasser la preview compacte tout en restant agreable a lire.',
  'Second paragraphe plus detaille avec une suite concrete pour verifier le depliage complet de la carte.',
].join('\n\n');

describe('CoachGuidanceCard', () => {
  it('renders the compact variant with a stronger continuation affordance and a lighter disclaimer', () => {
    render(
      <CoachGuidanceCard
        variant="compact"
        eyebrow="Dernier conseil"
        statusLabel="Enregistre"
        fallbackLabel="Secours"
        timestampLabel="18 avr. 09:30"
        personaKey="gentle_supportive"
        personaLabel="Personnalite du Coach"
        personaValue="Doux Bienveillant"
        personaAvatarFallbackLabel="DB"
        personaAvatarHaloTint="#88A7FF"
        title="Cap sur une semaine plus stable"
        body={LONG_BODY}
        disclaimerLabel="Rappel non diagnostique"
        disclaimerPillLabel="Info, pas diagnostic"
        disclaimer="Wellness guidance only. This is not a diagnosis or medical advice."
        expandLabel="Lire la suite"
        collapseLabel="Reduire"
        continuationHintLabel="Contenu resume, touchez pour ouvrir"
      />,
    );

    expect(screen.getByTestId('coach-guidance-card-variant-compact')).toBeTruthy();
    expect(screen.getByText('Dernier conseil')).toBeTruthy();
    expect(screen.getByText('Enregistre')).toBeTruthy();
    expect(screen.getByText('Secours')).toBeTruthy();
    expect(screen.getByText('Cap sur une semaine plus stable')).toBeTruthy();
    expect(screen.getByTestId('coach-guidance-timestamp').props.children).toBe(
      '18 avr. 09:30',
    );
    expect(screen.getByTestId('coach-guidance-preview').props.numberOfLines).toBe(2);
    expect(screen.getByTestId('coach-guidance-preview-fade')).toBeTruthy();
    expect(screen.getByTestId('coach-guidance-continuation-hint').props.children).toBe(
      'Contenu resume, touchez pour ouvrir',
    );
    expect(screen.getByTestId('coach-guidance-toggle').props.accessibilityRole).toBe(
      'button',
    );
    expect(
      screen.getByTestId('coach-guidance-toggle').props.accessibilityState.expanded,
    ).toBe(false);
    expect(screen.getByText('Lire la suite')).toBeTruthy();
    expect(screen.queryByText('Second paragraphe plus detaille avec une suite concrete pour verifier le depliage complet de la carte.')).toBeNull();
    expect(screen.getByTestId('coach-guidance-disclaimer').props.children).toBe(
      'Info, pas diagnostic',
    );
    expect(
      screen.getByTestId('coach-guidance-disclaimer').props.accessibilityLabel,
    ).toContain(
      'Wellness guidance only.',
    );

    fireEvent.press(screen.getByTestId('coach-guidance-toggle'));

    expect(
      screen.getByTestId('coach-guidance-toggle').props.accessibilityState.expanded,
    ).toBe(true);
    expect(
      screen.getByText(
        'Second paragraphe plus detaille avec une suite concrete pour verifier le depliage complet de la carte.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Reduire')).toBeTruthy();
  });

  it('renders the fresh variant with fuller content and optional CTA support', () => {
    const onCtaPress = jest.fn();

    render(
      <CoachGuidanceCard
        variant="fresh"
        eyebrow="Nouveau conseil"
        statusLabel="Recent"
        personaKey="analytical_precise"
        personaLabel="Personnalite du Coach"
        personaValue="Analytique Precis"
        personaAvatarFallbackLabel="AP"
        personaAvatarHaloTint="#53C6BB"
        title="Gardez deux priorites claires"
        body="Un seul paragraphe suffit ici."
        disclaimerLabel="Rappel non diagnostique"
        disclaimerPillLabel="Info, pas diagnostic"
        disclaimer="Wellness guidance only. This is not a diagnosis or medical advice."
        expandLabel="Lire la suite"
        collapseLabel="Reduire"
        continuationHintLabel="Contenu resume, touchez pour ouvrir"
        ctaLabel="Ouvrir mon plan"
        onCtaPress={onCtaPress}
      />,
    );

    expect(screen.getByTestId('coach-guidance-card-variant-fresh')).toBeTruthy();
    expect(
      screen.getByTestId('coach-guidance-card-persona-theme-analytical_precise'),
    ).toBeTruthy();
    expect(screen.queryByTestId('coach-guidance-toggle')).toBeNull();
    expect(screen.queryByTestId('coach-guidance-preview-fade')).toBeNull();
    expect(screen.getByText('Gardez deux priorites claires')).toBeTruthy();
    expect(screen.getByText('Un seul paragraphe suffit ici.')).toBeTruthy();
    expect(screen.getByText('Info, pas diagnostic')).toBeTruthy();
    expect(
      screen.getByTestId('coach-guidance-disclaimer').props.accessibilityLabel,
    ).toContain(
      'not a diagnosis',
    );

    fireEvent.press(screen.getByText('Ouvrir mon plan'));

    expect(onCtaPress).toHaveBeenCalledTimes(1);
  });

  it('hides optional timestamp, fallback badge, and CTA when they are not provided', () => {
    render(
      <CoachGuidanceCard
        variant="compact"
        eyebrow="Dernier conseil"
        statusLabel="Enregistre"
        personaKey="strict_tough"
        personaLabel="Personnalite du Coach"
        personaValue="Analytique Precis"
        personaAvatarFallbackLabel="AP"
        personaAvatarHaloTint="#53C6BB"
        title="Gardez deux priorites claires"
        body="Texte court."
        disclaimerLabel="Rappel non diagnostique"
        disclaimerPillLabel="Info, pas diagnostic"
        disclaimer="Wellness guidance only. This is not a diagnosis or medical advice."
        expandLabel="Lire la suite"
        collapseLabel="Reduire"
        continuationHintLabel="Contenu resume, touchez pour ouvrir"
      />,
    );

    expect(screen.queryByTestId('coach-guidance-timestamp')).toBeNull();
    expect(screen.queryByText('Secours')).toBeNull();
    expect(screen.queryByText('Ouvrir mon plan')).toBeNull();
    expect(screen.queryByTestId('coach-guidance-toggle')).toBeNull();
    expect(
      screen.getByTestId('coach-guidance-card-persona-theme-strict_tough'),
    ).toBeTruthy();
  });

  it('keeps structured guidance compact until the user expands it', () => {
    render(
      <CoachGuidanceCard
        variant="fresh"
        eyebrow="Conseil"
        statusLabel="Recent"
        personaKey="strict_tough"
        personaLabel="Personnalite du Coach"
        personaValue="Strict Exigeant"
        personaAvatarFallbackLabel="ST"
        personaAvatarHaloTint="#D6A94A"
        title="Priorite claire"
        body="Fallback body."
        content={{
          title: 'Priorite claire',
          summary: 'Reste sur une seule priorite pour eviter de disperser tes efforts.',
          context_notes: ['Ton dernier scan manque encore de tendance longue.'],
          priorities: ['Stabiliser le sommeil avant de changer le reste.'],
          action_steps: [
            'Choisis une heure fixe de coucher pendant trois soirs.',
            'Prepare la bouteille d eau avant 21h.',
          ],
          warnings: ['Surveille les changements brusques.'],
          encouragement: 'La regularite bat le gros effort isole.',
          primary_metric_delta: null,
          data_gaps: ['Peu de donnees corps', 'Pas de scan nutrition recent'],
          confidence: 'medium',
        }}
        sectionLabels={{
          context_notes: 'Ce que je remarque',
          priorities: 'A surveiller',
          action_steps: 'A faire maintenant',
          warnings: 'Vigilance',
          data_gaps: 'Zones sans assez de donnees',
        }}
        disclaimerLabel="Rappel non diagnostique"
        disclaimerPillLabel="Info, pas diagnostic"
        disclaimer="Wellness guidance only. This is not a diagnosis or medical advice."
        expandLabel="Lire la suite"
        collapseLabel="Reduire"
        continuationHintLabel="Contenu resume, touchez pour ouvrir"
      />,
    );

    expect(
      screen.getByTestId('coach-guidance-card-persona-theme-strict_tough'),
    ).toBeTruthy();
    expect(screen.getByTestId('coach-guidance-primary-action')).toBeTruthy();
    expect(
      screen.getByText('Choisis une heure fixe de coucher pendant trois soirs.'),
    ).toBeTruthy();
    expect(screen.getByTestId('coach-guidance-compact-signals')).toBeTruthy();
    expect(screen.queryByTestId('coach-section-context_notes')).toBeNull();

    fireEvent.press(screen.getByTestId('coach-guidance-toggle'));

    expect(screen.getByTestId('coach-section-context_notes')).toBeTruthy();
    expect(screen.getByText('Prepare la bouteille d eau avant 21h.')).toBeTruthy();
    expect(screen.getByText('Reduire')).toBeTruthy();
  });
});
