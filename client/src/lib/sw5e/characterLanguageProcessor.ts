
import { Character } from "@/lib/stores/useCharacter";

interface ThemeResult {
  mainThemes: string[];
  sentimentScore: number; // -1 (negative) to 1 (positive)
  entities: {
    people: string[];
    organizations: string[];
    locations: string[];
  };
  motivations: string[];
  personality: {
    traits: string[];
    values: string[];
    fears: string[];
  };
  relationshipHints: {
    allies: string[];
    enemies: string[];
    mentors: string[];
  };
  plotHooks: string[];
}

interface LanguageProcessorOptions {
  includeBackstory?: boolean;
  includeNotes?: boolean;
  includePersonality?: boolean;
  includeBonds?: boolean;
  includeIdeals?: boolean;
  includeFlaws?: boolean;
}

/**
 * Processes natural language from character descriptions, backstory,
 * and other narrative fields to extract themes, entities, and generate
 * plot hooks for use in the campaign
 */
export class CharacterLanguageProcessor {
  // Extract key themes and entities from character backstory and description
  processCharacterText(character: Character, options: LanguageProcessorOptions = {}): ThemeResult {
    // Collect all text sources based on options
    const textSources = [];

    if (options.includeBackstory && character.backstory) {
      textSources.push(character.backstory);
    }

    if (options.includeNotes && character.notes) {
      textSources.push(character.notes);
    }

    if (options.includePersonality && character.personalityTraits) {
      if (Array.isArray(character.personalityTraits)) {
        textSources.push(...character.personalityTraits);
      } else {
        textSources.push(character.personalityTraits);
      }
    }

    if (options.includeBonds && character.bonds) {
      if (Array.isArray(character.bonds)) {
        textSources.push(...character.bonds);
      } else {
        textSources.push(character.bonds);
      }
    }

    if (options.includeIdeals && character.ideals) {
      if (Array.isArray(character.ideals)) {
        textSources.push(...character.ideals);
      } else {
        textSources.push(character.ideals);
      }
    }

    if (options.includeFlaws && character.flaws) {
      if (Array.isArray(character.flaws)) {
        textSources.push(...character.flaws);
      } else {
        textSources.push(character.flaws);
      }
    }

    // Combine all text for processing
    const combinedText = textSources.join(" ");
    if (!combinedText) {
      return this.getDefaultResult();
    }

    return this.analyzeText(combinedText, character);
  }

  private analyzeText(text: string, character: Character): ThemeResult {
    // Basic sentiment analysis
    const sentimentScore = this.calculateSentiment(text);

    // Extract entities - basic implementation
    const entities = this.extractEntities(text);

    // Extract themes
    const mainThemes = this.extractThemes(text, character);

    // Extract motivations
    const motivations = this.extractMotivations(text, character);

    // Extract personality traits
    const personality = this.extractPersonality(text);

    // Identify potential relationship hints
    const relationshipHints = this.extractRelationships(text);

    // Generate plot hooks based on the analysis
    const plotHooks = this.generatePlotHooks(text, character, mainThemes, entities);

    return {
      mainThemes,
      sentimentScore,
      entities,
      motivations,
      personality,
      relationshipHints,
      plotHooks
    };
  }

  private calculateSentiment(text: string): number {
    // Simple sentiment analysis
    const positiveTerms = [
      'happy', 'joyful', 'passionate', 'excited', 'hope', 'love', 'friend', 'trust',
      'loyal', 'honor', 'good', 'peace', 'harmony', 'light', 'protect', 'save', 'help'
    ];

    const negativeTerms = [
      'sad', 'angry', 'hate', 'fear', 'despise', 'revenge', 'enemy', 'kill',
      'destroy', 'dark', 'evil', 'pain', 'suffering', 'loss', 'betrayal', 'death'
    ];

    const words = text.toLowerCase().split(/\W+/);
    let positiveCount = 0;
    let negativeCount = 0;

    words.forEach(word => {
      if (positiveTerms.includes(word)) positiveCount++;
      if (negativeTerms.includes(word)) negativeCount++;
    });

    // Normalize to a range between -1 and 1
    const totalCount = positiveCount + negativeCount;
    if (totalCount === 0) return 0;

    return (positiveCount - negativeCount) / totalCount;
  }

  private extractEntities(text: string): ThemeResult['entities'] {
    const entities = {
      people: [],
      organizations: [],
      locations: []
    };

    // Pattern matching for Star Wars typical organization names
    const orgPatterns = [
      /empire/gi, /rebellion/gi, /republic/gi, /alliance/gi, /jedi order/gi, 
      /sith/gi, /first order/gi, /new republic/gi, /trade federation/gi,
      /black sun/gi, /mandalorians/gi, /hutt cartel/gi, /galactic senate/gi
    ];

    // Pattern matching for Star Wars typical location names
    const locationPatterns = [
      /tatooine/gi, /coruscant/gi, /naboo/gi, /hoth/gi, /endor/gi, /dagobah/gi,
      /yavin/gi, /bespin/gi, /mustafar/gi, /kashyyyk/gi, /corellia/gi, /ryloth/gi,
      /mandalore/gi, /planet/gi, /moon/gi, /system/gi, /sector/gi, /quadrant/gi,
      /cantina/gi, /temple/gi, /base/gi, /station/gi, /capital/gi, /academy/gi
    ];

    // Extract organizations
    orgPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          if (!entities.organizations.includes(match)) {
            entities.organizations.push(match);
          }
        });
      }
    });

    // Extract locations
    locationPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          if (!entities.locations.includes(match)) {
            entities.locations.push(match);
          }
        });
      }
    });

    // Simple person detection - look for capitalized names
    // This is a basic implementation and would be enhanced in a real NLP system
    const namePattern = /\b[A-Z][a-z]+ (?:[A-Z][a-z]+\s?)+\b/g;
    const potentialNames = text.match(namePattern) || [];
    entities.people = [...new Set(potentialNames)];

    return entities;
  }

  private extractThemes(text: string, character: Character): string[] {
    const themePatterns = {
      'redemption': [/redemption/gi, /redeem/gi, /second chance/gi, /forgiveness/gi],
      'revenge': [/revenge/gi, /vengeance/gi, /avenge/gi, /payback/gi],
      'justice': [/justice/gi, /fair/gi, /right wrongs/gi, /law/gi],
      'power': [/power/gi, /control/gi, /dominance/gi, /rule/gi, /strength/gi],
      'freedom': [/freedom/gi, /liberty/gi, /independence/gi, /escape/gi, /free/gi],
      'discovery': [/discover/gi, /exploration/gi, /find/gi, /learn/gi, /knowledge/gi],
      'family': [/family/gi, /father/gi, /mother/gi, /brother/gi, /sister/gi, /parent/gi, /son/gi, /daughter/gi],
      'duty': [/duty/gi, /responsibility/gi, /obligation/gi, /honor/gi, /loyal/gi],
      'survival': [/survival/gi, /survive/gi, /stay alive/gi, /escape/gi, /fled/gi],
      'wealth': [/wealth/gi, /money/gi, /rich/gi, /credits/gi, /fortune/gi, /treasure/gi]
    };

    const detectedThemes = [];

    // Check for each theme
    Object.entries(themePatterns).forEach(([theme, patterns]) => {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          detectedThemes.push(theme);
          break; // Found this theme, no need to check other patterns
        }
      }
    });

    // If no themes were detected from the text, infer from character attributes
    if (detectedThemes.length === 0) {
      // Infer based on class
      switch(character.class) {
        case 'consular':
        case 'guardian': 
          detectedThemes.push('justice', 'duty');
          break;
        case 'sentinel':
          detectedThemes.push('discovery', 'justice');
          break;
        case 'berserker':
          detectedThemes.push('survival', 'power');
          break;
        case 'engineer':
          detectedThemes.push('discovery', 'creation');
          break;
        case 'scholar':
          detectedThemes.push('knowledge', 'discovery');
          break;
        case 'scout':
          detectedThemes.push('exploration', 'freedom');
          break;
        default:
          detectedThemes.push('adventure');
      }

      // Infer based on background
      switch(character.background) {
        case 'criminal':
          detectedThemes.push('wealth', 'freedom');
          break;
        case 'noble':
          detectedThemes.push('duty', 'power');
          break;
        case 'soldier':
          detectedThemes.push('duty', 'honor');
          break;
        case 'pilot':
          detectedThemes.push('freedom', 'adventure');
          break;
        case 'jedi':
          detectedThemes.push('justice', 'protection');
          break;
        case 'sith':
          detectedThemes.push('power', 'passion');
          break;
      }
    }

    // Return unique themes
    return [...new Set(detectedThemes)];
  }

  private extractMotivations(text: string, character: Character): string[] {
    const motivationPatterns = {
      'revenge': [/revenge/gi, /avenge/gi, /get back at/gi, /make them pay/gi],
      'protection': [/protect/gi, /defend/gi, /save/gi, /shield/gi, /guard/gi],
      'discovery': [/discover/gi, /find/gi, /search/gi, /seek/gi, /learn/gi],
      'wealth': [/money/gi, /wealth/gi, /rich/gi, /credits/gi, /payment/gi],
      'power': [/power/gi, /strength/gi, /control/gi, /force/gi, /influence/gi],
      'redemption': [/redemption/gi, /redeem/gi, /forgiveness/gi, /atone/gi],
      'freedom': [/freedom/gi, /escape/gi, /liberty/gi, /free/gi],
      'duty': [/duty/gi, /obligation/gi, /must/gi, /order/gi, /commanded/gi],
      'justice': [/justice/gi, /right wrongs/gi, /fair/gi, /law/gi],
      'family': [/family/gi, /father/gi, /mother/gi, /brother/gi, /sister/gi]
    };

    const detectedMotivations = [];

    // Check for each motivation
    Object.entries(motivationPatterns).forEach(([motivation, patterns]) => {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          detectedMotivations.push(motivation);
          break; 
        }
      }
    });

    // If no clear motivation, fall back on class-based motivations
    if (detectedMotivations.length === 0) {
      const { CharacterProfileParser } = require('./characterProfileParser');
      const parser = new CharacterProfileParser();
      const profile = {
        name: character.name,
        species: character.species,
        class: character.class,
        level: character.level,
        background: character.background,
        alignment: character.alignment,
        abilities: character.abilityScores
      };

      const themes = parser.analyzeProfile(profile);
      if (themes.motivation) {
        detectedMotivations.push(themes.motivation);
      }
    }

    return [...new Set(detectedMotivations)];
  }

  private extractPersonality(text: string): ThemeResult['personality'] {
    const personality = {
      traits: [],
      values: [],
      fears: []
    };

    // Personality traits patterns
    const traitPatterns = {
      'brave': [/brave/gi, /courageous/gi, /fearless/gi, /bold/gi],
      'cautious': [/cautious/gi, /careful/gi, /wary/gi, /vigilant/gi],
      'arrogant': [/arrogant/gi, /proud/gi, /ego/gi, /overconfident/gi],
      'compassionate': [/compassionate/gi, /kind/gi, /caring/gi, /generous/gi],
      'ruthless': [/ruthless/gi, /merciless/gi, /brutal/gi, /cruel/gi],
      'curious': [/curious/gi, /inquisitive/gi, /questioning/gi],
      'honorable': [/honorable/gi, /honor/gi, /principled/gi, /integrity/gi],
      'deceptive': [/deceptive/gi, /lie/gi, /manipulative/gi, /cunning/gi],
      'humorous': [/humor/gi, /funny/gi, /joke/gi, /witty/gi, /sarcastic/gi],
      'serious': [/serious/gi, /stern/gi, /solemn/gi, /grave/gi]
    };

    // Values patterns
    const valuePatterns = {
      'freedom': [/freedom/gi, /liberty/gi, /independence/gi],
      'loyalty': [/loyalty/gi, /loyal/gi, /commitment/gi, /dedication/gi],
      'knowledge': [/knowledge/gi, /wisdom/gi, /learning/gi, /truth/gi],
      'family': [/family/gi, /kin/gi, /blood/gi, /relatives/gi],
      'tradition': [/tradition/gi, /heritage/gi, /custom/gi, /way/gi],
      'power': [/power/gi, /strength/gi, /dominance/gi, /control/gi],
      'wealth': [/wealth/gi, /money/gi, /riches/gi, /fortune/gi, /credits/gi],
      'justice': [/justice/gi, /fairness/gi, /equality/gi, /rights/gi],
      'honor': [/honor/gi, /reputation/gi, /respect/gi, /dignity/gi],
      'adventure': [/adventure/gi, /thrill/gi, /excitement/gi, /danger/gi]
    };

    // Fear patterns
    const fearPatterns = {
      'failure': [/fail/gi, /failure/gi, /disappoint/gi, /shame/gi],
      'death': [/death/gi, /die/gi, /mortality/gi, /end/gi],
      'loss': [/loss/gi, /lose/gi, /lost/gi, /gone/gi],
      'betrayal': [/betrayal/gi, /betrayed/gi, /trust/gi, /treachery/gi],
      'humiliation': [/humiliation/gi, /embarrass/gi, /ridicule/gi, /mock/gi],
      'powerlessness': [/powerless/gi, /weak/gi, /helpless/gi, /vulnerable/gi],
      'isolation': [/alone/gi, /lonely/gi, /abandoned/gi, /isolation/gi],
      'rejection': [/reject/gi, /refuse/gi, /deny/gi, /cast out/gi, /exile/gi],
      'darkness': [/darkness/gi, /dark side/gi, /corruption/gi, /temptation/gi],
      'past': [/past/gi, /history/gi, /mistakes/gi, /regret/gi, /haunted/gi]
    };

    // Extract personality traits
    Object.entries(traitPatterns).forEach(([trait, patterns]) => {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          personality.traits.push(trait);
          break;
        }
      }
    });

    // Extract values
    Object.entries(valuePatterns).forEach(([value, patterns]) => {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          personality.values.push(value);
          break;
        }
      }
    });

    // Extract fears
    Object.entries(fearPatterns).forEach(([fear, patterns]) => {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          personality.fears.push(fear);
          break;
        }
      }
    });

    return personality;
  }

  private extractRelationships(text: string): ThemeResult['relationshipHints'] {
    const relationships = {
      allies: [],
      enemies: [],
      mentors: []
    };

    // Ally patterns
    const allyPatterns = [
      /friend/gi, /ally/gi, /comrade/gi, /partner/gi, /companion/gi, 
      /helped/gi, /trusted/gi, /loyal/gi, /supported/gi, /protected/gi
    ];

    // Enemy patterns
    const enemyPatterns = [
      /enemy/gi, /nemesis/gi, /rival/gi, /foe/gi, /adversary/gi,
      /betrayed/gi, /hunted/gi, /killed/gi, /destroyed/gi, /hate/gi
    ];

    // Mentor patterns
    const mentorPatterns = [
      /mentor/gi, /teacher/gi, /master/gi, /trained/gi, /taught/gi,
      /guide/gi, /instructor/gi, /elder/gi, /learn from/gi, /wisdom/gi
    ];

    // Match names or entities near relationship indicators
    const relationshipNamePattern = /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/g;
    const sentences = text.split(/[.!?]+/);

    sentences.forEach(sentence => {
      const names = sentence.match(relationshipNamePattern) || [];

      if (names.length > 0) {
        // Check if sentence contains ally indicators
        if (allyPatterns.some(pattern => pattern.test(sentence))) {
          relationships.allies.push(...names);
        }

        // Check if sentence contains enemy indicators
        if (enemyPatterns.some(pattern => pattern.test(sentence))) {
          relationships.enemies.push(...names);
        }

        // Check if sentence contains mentor indicators
        if (mentorPatterns.some(pattern => pattern.test(sentence))) {
          relationships.mentors.push(...names);
        }
      }
    });

    // Remove duplicates and return
    return {
      allies: [...new Set(relationships.allies)],
      enemies: [...new Set(relationships.enemies)],
      mentors: [...new Set(relationships.mentors)]
    };
  }

  private generatePlotHooks(text: string, character: Character, themes: string[], entities: any): string[] {
    const plotHooks = [];

    // Generate hooks based on themes
    if (themes.includes('revenge')) {
      plotHooks.push(`An opportunity arises to confront someone who wronged ${character.name} in the past.`);
    }

    if (themes.includes('discovery')) {
      plotHooks.push(`A mysterious artifact is discovered that connects to ${character.name}'s quest for knowledge.`);
    }

    if (themes.includes('redemption')) {
      plotHooks.push(`${character.name} encounters someone from their past who offers a chance to right a previous wrong.`);
    }

    if (themes.includes('family')) {
      plotHooks.push(`News arrives about a long-lost family member of ${character.name} who needs help.`);
    }

    // Generate hooks based on entities
    if (entities.people.length > 0) {
      const person = entities.people[Math.floor(Math.random() * entities.people.length)];
      plotHooks.push(`${person} sends an urgent message requesting ${character.name}'s assistance.`);
    }

    if (entities.organizations.length > 0) {
      const org = entities.organizations[Math.floor(Math.random() * entities.organizations.length)];
      plotHooks.push(`The ${org} offers a mission that aligns with ${character.name}'s goals.`);
    }

    if (entities.locations.length > 0) {
      const location = entities.locations[Math.floor(Math.random() * entities.locations.length)];
      plotHooks.push(`Disturbing news emerges from ${location} that draws ${character.name}'s attention.`);
    }

    // Class-specific hooks
    switch(character.class) {
      case 'consular':
      case 'guardian':
      case 'sentinel':
        plotHooks.push(`A disturbance in the Force points to a situation that requires ${character.name}'s unique abilities.`);
        break;
      case 'engineer':
        plotHooks.push(`A complex technical problem emerges that only ${character.name}'s expertise can solve.`);
        break;
      case 'scholar':
        plotHooks.push(`An ancient text is discovered that references knowledge ${character.name} has been seeking.`);
        break;
      case 'scout':
      case 'operative':
        plotHooks.push(`Intelligence arrives about a secret location that ${character.name} would be uniquely qualified to infiltrate.`);
        break;
    }

    // Add generic hooks if we don't have enough
    if (plotHooks.length < 3) {
      plotHooks.push(`A mysterious stranger recognizes ${character.name} and offers information about their past.`);
      plotHooks.push(`${character.name} receives a cryptic message leading to an unexpected adventure.`);
      plotHooks.push(`An old acquaintance of ${character.name} appears with a lucrative but dangerous opportunity.`);
    }

    // Return maximum 5 plot hooks
    return plotHooks.slice(0, 5);
  }

  private getDefaultResult(): ThemeResult {
    return {
      mainThemes: ['adventure'],
      sentimentScore: 0,
      entities: {
        people: [],
        organizations: [],
        locations: []
      },
      motivations: ['discovery'],
      personality: {
        traits: [],
        values: [],
        fears: []
      },
      relationshipHints: {
        allies: [],
        enemies: [],
        mentors: []
      },
      plotHooks: [
        'A mysterious stranger offers an opportunity for adventure.',
        'A distress signal leads to an unexpected journey.',
        'A valuable artifact is rumored to be hidden nearby.'
      ]
    };
  }
}

// Utility function to quickly process character text
export function processCharacterNarrative(character: Character): ThemeResult {
  const processor = new CharacterLanguageProcessor();
  return processor.processCharacterText(character, {
    includeBackstory: true,
    includeNotes: true,
    includePersonality: true,
    includeBonds: true,
    includeIdeals: true,
    includeFlaws: true
  });
}
