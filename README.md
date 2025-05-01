
# Star Wars 5e Character Creator Components

This document outlines the component architecture of the SW5e character creator application.

## Component Organization

The application has two primary character creation flows:

### 1. Form-Based Creation (`/components/CharacterCreation/`)

The form-based approach allows users to fill out different sections in any order they prefer. This is implemented in:
- `CharacterCreationForm.tsx` - The main form container
- Individual form sections (SpeciesSelection, ClassSelection, etc.)

### 2. Guided Step-by-Step Creation (`/components/CharacterCreator/`)

The guided approach walks users through character creation step-by-step with validation at each step:
- `CharacterCreator.tsx` - The main step-by-step creation flow
- `StepNavigation.tsx` - Controls for moving between steps
- Support components specific to the guided flow

### Entry Point

- `CharacterCreatorMain.tsx` - Serves as the selection screen between the two creation flows

## Shared Components

Components in the `CharacterCreation/` folder are used by both flows. They provide the core functionality for selecting character options and are designed to be reusable.

## Validation

- `ValidationProgress.tsx` - A unified component for tracking character completion status
- Used by both creation flows with different configurations

## Component Structure Best Practices

1. For new character creation features, add the core components to `CharacterCreation/`
2. For step-specific UI enhancements to the guided flow, add them to `CharacterCreator/`
3. For shared UI components not specific to character creation, add them to `ui/`

## Future Development

When adding new features, consider:
- Can this be a shared component used by both flows?
- Is this specific to the guided step-by-step experience?
- Does this affect validation and progression tracking?
