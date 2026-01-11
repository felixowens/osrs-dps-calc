"""
    Script to find equipment items that are missing skill requirements entries.

    These items cannot be properly filtered when "Enforce skill requirements" is enabled
    in the optimizer, so they are excluded from optimization to be safe.

    The output JSON file lists all items missing requirements for manual review.

    Written for Python 3.9.
"""
import os
import json
from collections import defaultdict

EQUIPMENT_PATH = '../cdn/json/equipment.json'
REQUIREMENTS_PATH = '../cdn/json/equipment-requirements.json'
ALIASES_PATH = '../cdn/json/equipment_aliases.json'
OUTPUT_PATH = '../cdn/json/missing-requirements.json'


def get_wiki_name(item):
    """
    Extract the wiki name from the image field.
    The image field is typically like "Item name.png" or "Item name (variant).png".
    """
    image = item.get('image', '')
    if image.endswith('.png'):
        return image[:-4]
    return image


def main():
    print('=== Missing Requirements Finder ===\n')

    # Change to script directory for relative paths
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    # Load equipment
    print('Loading equipment.json...')
    with open(EQUIPMENT_PATH, 'r') as f:
        equipment = json.load(f)
    print(f'Found {len(equipment)} equipment items')

    # Load requirements
    print('Loading equipment-requirements.json...')
    with open(REQUIREMENTS_PATH, 'r') as f:
        requirements = json.load(f)
    requirements_ids = set(int(k) for k in requirements.keys())
    print(f'Found {len(requirements_ids)} items with requirements')

    # Load aliases (variant_id -> base_id)
    print('Loading equipment_aliases.json...')
    with open(ALIASES_PATH, 'r') as f:
        aliases = json.load(f)
    # Convert to int keys
    alias_map = {int(k): int(v) for k, v in aliases.items()}
    print(f'Found {len(alias_map)} item aliases')

    # Find items missing requirements
    print('\nAnalyzing items...')
    missing = []
    by_slot = defaultdict(list)

    for item in equipment:
        item_id = item['id']
        item_name = item['name']
        item_version = item.get('version', '')
        item_slot = item.get('slot', 'unknown')
        wiki_name = get_wiki_name(item)

        # Check if item has requirements directly
        if item_id in requirements_ids:
            continue

        # Check if item is a variant with a base item that has requirements
        base_id = alias_map.get(item_id)
        if base_id is not None and base_id in requirements_ids:
            continue

        # Item is missing requirements
        entry = {
            'id': item_id,
            'name': item_name,
            'wiki_name': wiki_name,
            'version': item_version,
            'slot': item_slot,
        }

        # Include base_id if it's aliased (but base also missing requirements)
        if base_id is not None:
            entry['aliased_to'] = base_id

        missing.append(entry)
        by_slot[item_slot].append(item_name)

    # Sort by slot, then by name
    missing.sort(key=lambda x: (x['slot'], x['name']))

    # Output results
    print(f'\n=== Results ===')
    print(f'Items missing requirements: {len(missing)}')
    print(f'\nBy slot:')
    for slot in sorted(by_slot.keys()):
        print(f'  {slot}: {len(by_slot[slot])}')

    # Save to JSON
    output = {
        'total_equipment': len(equipment),
        'total_with_requirements': len(requirements_ids),
        'total_missing': len(missing),
        'by_slot_counts': {slot: len(items) for slot, items in sorted(by_slot.items())},
        'items': missing,
    }

    with open(OUTPUT_PATH, 'w') as f:
        json.dump(output, f, indent=2)

    print(f'\nOutput saved to: {OUTPUT_PATH}')

    # Print some example items for quick review
    print(f'\nExample missing items (first 10):')
    for item in missing[:10]:
        alias_info = f" (aliased to {item['aliased_to']})" if 'aliased_to' in item else ""
        print(f"  [{item['slot']}] {item['name']} (id: {item['id']}){alias_info}")


if __name__ == '__main__':
    main()
