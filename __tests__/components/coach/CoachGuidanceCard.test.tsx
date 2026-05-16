import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { CoachGuidanceCard } from '@/components/coach/CoachGuidanceCard';

const LONG_BODY = [
  'Premier paragraphe de guidance avec assez de contexte pour depasser la preview compacte tout en restant agreable a lire.',
  'Second paragraphe plus detaille avec une suite concrete pour verifier le depliage complet de la carte.',
].join('\n\n');

describe('CoachGuidanceCard', () => {
  it.each(['compact', 'fresh'] as const)(
    'removes external shadow artifacts from the %s result card',
    (variant) => {
      render(
        <CoachGuidanceCard
          variant={variant}
          eyebrow="Conseil"
          statusLabel="Recent"
          personaKey="gentle_supportive"
          personaLabel="Personnalite du Coach"
          personaValue="Noah"
          personaAvatarFallbackLabel="NO"
          personaAvatarHaloTint="#88A7FF"
          title="Plan du jour"
          body="Un seul paragraphe suffit ici."
          disclaimerLabel="Rappel non diagnostique"
          disclaimerPillLabel="Info, pas diagnostic"
          disclaimer="Wellness guidance only. This is not a diagnosis or medical advice."
          expandLabel="Lire la suite"
          collapseLabel="Reduire"
          continuationHintLabel="Contenu resume, touchez pour ouvrir"
        />,
      );

      const cardStyle = StyleSheet.flatten(
        screen.getByTestId('coach-guidance-card').props.style,
      );

      expect(cardStyle).toEqual(
        expect.objectContaining({
          shadowColor: 'transparent',
          shadowOpacity: 0,
          shadowRadius: 0,
          shadowOffset: { width: 0, height: 0 },
          elevation: 0,
        }),
      );
    },
  );

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
        personaValue="Noah"
        personaAvatarFallbackLabel="NO"
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
        personaValue="Elias"
        personaAvatarFallbackLabel="EL"
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
        personaValue="Elias"
        personaAvatarFallbackLabel="EL"
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
        personaValue="Axel"
        personaAvatarFallbackLabel="AX"
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

  it('renders structured guidance expanded by default when requested and still lets the user collapse it', () => {
    render(
      <CoachGuidanceCard
        variant="fresh"
        eyebrow="Conseil"
        statusLabel="Recent"
        personaKey="patient_calm"
        personaLabel="Personnalite du Coach"
        personaValue="Mira"
        personaAvatarFallbackLabel="MI"
        personaAvatarHaloTint="#7BC6D8"
        title="Pauses eau"
        body="Prenons un moment."
        content={{
          title: 'Pauses eau',
          summary: 'Prenons un moment. Quelques pauses d eau dans la journee.',
          context_notes: [],
          priorities: [],
          action_steps: ['Pose une bouteille visible pres de toi.'],
          warnings: [],
          encouragement: 'Boire posement, c est se recentrer.',
          primary_metric_delta: null,
          data_gaps: [],
          confidence: 'high',
          micro_routine: [
            {
              name: 'Pauses eau',
              when: 'toute la journee',
              total_min: 3,
              steps: [
                '7h30 - verre d eau + 3 respirations douces',
                '11h - verre d eau en silence',
              ],
            },
          ],
        }}
        sectionLabels={{
          action_steps: 'A faire maintenant',
          micro_routine: 'Routine courte',
          minutes: '{{count}} min',
        }}
        disclaimerLabel="Rappel non diagnostique"
        disclaimerPillLabel="Info, pas diagnostic"
        disclaimer="Wellness guidance only. This is not a diagnosis or medical advice."
        expandLabel="Lire la suite"
        collapseLabel="Reduire"
        continuationHintLabel="Contenu resume, touchez pour ouvrir"
        defaultExpanded
      />,
    );

    expect(screen.getByTestId('coach-guidance-toggle').props.accessibilityState.expanded).toBe(
      true,
    );
    expect(screen.getByTestId('coach-section-micro_routine')).toBeTruthy();
    expect(screen.getByText('Pauses eau · toute la journee · 3 min')).toBeTruthy();

    fireEvent.press(screen.getByTestId('coach-guidance-toggle'));

    expect(screen.getByTestId('coach-guidance-toggle').props.accessibilityState.expanded).toBe(
      false,
    );
    expect(screen.queryByTestId('coach-section-micro_routine')).toBeNull();
    expect(screen.getByText('Lire la suite')).toBeTruthy();
  });

  it('renders the full v2 reset payload without missing interpolation or merged habits', () => {
    const rendered = render(
      <CoachGuidanceCard
        variant="fresh"
        eyebrow="Conseil"
        statusLabel="Recent"
        personaKey="gentle_supportive"
        personaLabel="Personnalite du Coach"
        personaValue="Noah"
        personaAvatarFallbackLabel="NO"
        personaAvatarHaloTint="#88A7FF"
        title="Petit reset tout doux"
        body={[
          'On y va doucement. 48h pour souffler, rien de plus.',
          "✓ Essaie de préparer ton environnement pour un soir calme (lumière tamisée, téléphone en mode silencieux).",
          "✓ Tu pourrais noter une ou deux choses qui t'ont fait du bien aujourd'hui, sans pression.",
          "✓ N'oublie pas de boire un grand verre d'eau en te levant demain matin.",
          'Routine — Reset doux 48h (J1 et J2) · 15 min 1. J1 — dîner léger ce soir 2. J1 — coucher plus tôt si tu peux 3. J2 — un verre d’eau au réveil 4. J2 — marche de 10 min dehors Habitudes a tenir : ☐ Coucher avant 23h · 3j/7 (soir) ☐ Boire 2L d’eau par jour · 3j/7 (journée) ☐ Marche 10 min par jour · 3j/7 (libre)',
        ].join('\n')}
        content={{
          title: 'Petit reset tout doux',
          summary: 'On y va doucement. 48h pour souffler, rien de plus.',
          context_notes: [],
          priorities: [],
          action_steps: [
            'Essaie de préparer ton environnement pour un soir calme (lumière tamisée, téléphone en mode silencieux).',
            "Tu pourrais noter une ou deux choses qui t'ont fait du bien aujourd'hui, sans pression.",
            "N'oublie pas de boire un grand verre d'eau en te levant demain matin.",
          ],
          warnings: [
            'Pas besoin de rattraper le temps perdu, chaque petit pas compte.',
            'Évite les écrans au moins 30 min avant de dormir si possible.',
          ],
          encouragement:
            "C'est déjà beau de prendre ce temps pour toi. Tu fais bien.",
          primary_metric_delta: null,
          data_gaps: [],
          confidence: 'low',
          daily_schedule: [],
          micro_routine: [
            {
              name: 'Reset doux 48h',
              when: 'J1 et J2',
              total_min: 15,
              steps: [
                'J1 — dîner léger ce soir',
                'J1 — coucher plus tôt si tu peux',
                'J2 — un verre d’eau au réveil',
                'J2 — marche de 10 min dehors',
              ],
            },
          ],
          meal_template: null,
          meal_swaps: [],
          shopping_list: [],
          quick_recipe: null,
          knowledge_card: null,
          habit_tracker: [
            {
              label: 'Coucher avant 23h',
              target_days: 3,
              window: 'soir',
            },
            {
              label: "Boire 2L d'eau par jour",
              target_days: 3,
              window: 'journée',
            },
            {
              label: 'Marche 10 min par jour',
              target_days: 3,
              window: 'libre',
            },
          ],
          reminders: [],
          next_scan_suggestion: null,
          signal_watch: [],
          streak_celebration: null,
          profile_updates: null,
        }}
        sectionLabels={{
          action_steps: 'A faire maintenant',
          warnings: 'Vigilance',
          micro_routine: 'Routine courte',
          habit_tracker: 'Habitudes a tenir',
          minutes: '[missing "15" value] min',
          days_per_week: '[missing "3" value]j/7',
          formatters: {
            minutes: (count) => `${count} min`,
            daysPerWeek: (count) => `${count}j/7`,
          },
        }}
        disclaimerLabel="Rappel non diagnostique"
        disclaimerPillLabel="Info, pas diagnostic"
        disclaimer="Conseil bien-etre uniquement. Ceci ne remplace ni un diagnostic ni un avis medical."
        expandLabel="Lire la suite"
        collapseLabel="Reduire"
        continuationHintLabel="Contenu resume, touchez pour ouvrir"
        defaultExpanded
      />,
    );

    expect(JSON.stringify(rendered.toJSON())).not.toContain('[missing');
    expect(screen.getByTestId('coach-section-micro_routine')).toBeTruthy();
    expect(screen.getByText('Reset doux 48h · J1 et J2 · 15 min')).toBeTruthy();
    expect(screen.getByText('J2 — marche de 10 min dehors')).toBeTruthy();
    expect(screen.queryByText(/J2 — marche de 10 min dehors Habitudes/)).toBeNull();
    expect(screen.getByTestId('coach-section-habit_tracker')).toBeTruthy();
    expect(screen.getByText('Coucher avant 23h · 3j/7 · soir')).toBeTruthy();
    expect(screen.getByText("Boire 2L d'eau par jour · 3j/7 · journée")).toBeTruthy();
    expect(screen.getByText('Marche 10 min par jour · 3j/7 · libre')).toBeTruthy();
  });

  it('renders nutrition artifacts with human labels and hides empty fields', () => {
    render(
      <CoachGuidanceCard
        variant="fresh"
        eyebrow="Conseil"
        statusLabel="Recent"
        personaKey="motivational_energetic"
        personaLabel="Personnalite du Coach"
        personaValue="Leo"
        personaAvatarFallbackLabel="LE"
        personaAvatarHaloTint="#FF9F3E"
        title="Ton fuel du jour"
        body="Fallback body."
        content={{
          title: 'Ton fuel du jour',
          summary:
            'On y va ! Voici le combo simple et efficace pour tenir 3 jours sans stress.',
          context_notes: [],
          priorities: [],
          action_steps: [
            'Va au marche ce soir a 17h pour acheter ta liste starter pack.',
            'Demain midi, prepare ton bowl en 12 min chrono.',
          ],
          warnings: [],
          encouragement:
            'Tu construis ta progression, repas par repas. La serie continue !',
          primary_metric_delta: null,
          data_gaps: [],
          confidence: 'high',
          meal_template: {
            name: 'Bowl Boost Proteines',
            when: 'midi',
            prep_min: 12,
            ingredients: [
              { item: 'Poulet', portion: '150 g' },
              { item: 'Quinoa cuit', portion: '1 tasse' },
            ],
            why:
              'Proteines + bonnes graisses + glucides a IG bas = energie durable.',
          },
          meal_swaps: [
            {
              from: 'Soda',
              to: 'Eau petillante + citron',
              why: 'Meme punch, zero sucre.',
            },
          ],
          quick_recipe: {
            name: 'Bowl express',
            total_min: null,
            steps: ['Cuire le quinoa.', 'Dresser le bol.'],
            tags: [],
          },
          habit_tracker: [
            {
              label: 'Bowl proteine midi',
              target_days: 6,
              window: 'midi',
            },
          ],
          shopping_list: [],
          reminders: [],
          next_scan_suggestion: null,
        }}
        sectionLabels={{
          action_steps: 'A faire maintenant',
          meal_template: 'Prochain repas',
          meal_swaps: 'Echanges malins',
          quick_recipe: 'Recette flash',
          habit_tracker: 'Habitudes a tenir',
          days_per_week: '{{count}}j/7',
          minutes: '{{count}} min',
        }}
        disclaimerLabel="Rappel non diagnostique"
        disclaimerPillLabel="Info, pas diagnostic"
        disclaimer="Wellness guidance only. This is not a diagnosis or medical advice."
        expandLabel="Lire la suite"
        collapseLabel="Reduire"
        continuationHintLabel="Contenu resume, touchez pour ouvrir"
      />,
    );

    expect(screen.getByTestId('coach-guidance-structured-teaser')).toBeTruthy();
    expect(screen.getByText('Prochain repas: Bowl Boost Proteines')).toBeTruthy();
    expect(screen.queryByTestId('coach-section-meal_template')).toBeNull();

    fireEvent.press(screen.getByTestId('coach-guidance-toggle'));

    expect(screen.getByTestId('coach-section-meal_template')).toBeTruthy();
    expect(screen.getByTestId('coach-section-quick_recipe')).toBeTruthy();
    expect(screen.getByTestId('coach-section-meal_swaps')).toBeTruthy();
    expect(screen.getByTestId('coach-section-habit_tracker')).toBeTruthy();
    expect(screen.getByText('Bowl Boost Proteines · midi · 12 min')).toBeTruthy();
    expect(screen.getByText(/Poulet.*150 g/)).toBeTruthy();
    expect(screen.getByText('Bowl express')).toBeTruthy();
    expect(screen.getByText(/Soda.*Eau petillante \+ citron/)).toBeTruthy();
    expect(screen.getByText('Bowl proteine midi · 6j/7 · midi')).toBeTruthy();
    expect(screen.queryByText('meal_template')).toBeNull();
    expect(screen.queryByText('null')).toBeNull();
    expect(screen.queryByText('[empty array]')).toBeNull();
  });
});
