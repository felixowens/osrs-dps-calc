"""
    Script to fetch equipment skill requirements from osrsreboxed-db.

    The requirements JSON file is placed in ../cdn/json/equipment-requirements.json.

    This script is idempotent - it will skip items that already have requirements
    in the output file and only fetch missing ones.

    Written for Python 3.9.
"""
import os
import json
import requests
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

EQUIPMENT_PATH = '../cdn/json/equipment.json'
OUTPUT_PATH = '../cdn/json/equipment-requirements.json'
BASE_URL = 'https://raw.githubusercontent.com/0xNeffarion/osrsreboxed-db/refs/heads/master/docs/items-json'

# Rate limiting
BATCH_SIZE = 50
BATCH_DELAY_SECONDS = 1.0
MAX_WORKERS = 10

def fetch_item_requirements(item_id):
    """Fetch requirements for a single item from osrsreboxed-db."""
    url = f'{BASE_URL}/{item_id}.json'

    try:
        r = requests.get(url, headers={
            'User-Agent': 'osrs-dps-calc (https://github.com/weirdgloop/osrs-dps-calc)'
        }, timeout=10)

        if r.status_code == 404:
            # Item not found in osrsreboxed-db, skip silently
            return item_id, None

        r.raise_for_status()
        data = r.json()

        # Requirements are in equipment.requirements
        if data.get('equipment') and data['equipment'].get('requirements'):
            reqs = data['equipment']['requirements']
            if reqs and len(reqs) > 0:
                return item_id, reqs

        return item_id, None

    except Exception as e:
        print(f'  Error fetching item {item_id}: {e}')
        return item_id, None


def main():
    print('=== Equipment Requirements Fetcher ===\n')

    # Change to script directory for relative paths
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    # Load existing equipment
    print('Loading equipment.json...')
    with open(EQUIPMENT_PATH, 'r') as f:
        equipment = json.load(f)
    print(f'Found {len(equipment)} equipment items\n')

    # Load existing requirements (for idempotency)
    existing_requirements = {}
    if os.path.exists(OUTPUT_PATH):
        print('Loading existing requirements...')
        with open(OUTPUT_PATH, 'r') as f:
            existing_requirements = json.load(f)
        print(f'Found {len(existing_requirements)} existing requirements\n')

    # Get all item IDs that need fetching
    all_item_ids = [item['id'] for item in equipment]
    items_to_fetch = [
        item_id for item_id in all_item_ids
        if str(item_id) not in existing_requirements
    ]

    print(f'Items to fetch: {len(items_to_fetch)}\n')

    if len(items_to_fetch) == 0:
        print('All items already have requirements. Nothing to do.')
        return

    # Fetch in batches with threading
    all_requirements = dict(existing_requirements)
    new_requirements_count = 0
    total_batches = (len(items_to_fetch) + BATCH_SIZE - 1) // BATCH_SIZE

    for batch_num, i in enumerate(range(0, len(items_to_fetch), BATCH_SIZE)):
        batch = items_to_fetch[i:i + BATCH_SIZE]
        batch_display = f'{batch_num + 1}/{total_batches}'
        items_display = f'{i + 1}-{min(i + BATCH_SIZE, len(items_to_fetch))}'

        print(f'Fetching batch {batch_display} (items {items_display})...', end='', flush=True)

        batch_found = 0
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = {executor.submit(fetch_item_requirements, item_id): item_id for item_id in batch}

            for future in as_completed(futures):
                item_id, requirements = future.result()
                if requirements:
                    all_requirements[str(item_id)] = requirements
                    batch_found += 1
                    new_requirements_count += 1

        print(f' found {batch_found} with requirements')

        # Save progress after each batch (for resume capability)
        with open(OUTPUT_PATH, 'w') as f:
            json.dump(all_requirements, f, indent=2)

        # Rate limit between batches
        if i + BATCH_SIZE < len(items_to_fetch):
            time.sleep(BATCH_DELAY_SECONDS)

    print(f'\n=== Complete ===')
    print(f'Total items with requirements: {len(all_requirements)}')
    print(f'New requirements added: {new_requirements_count}')
    print(f'Output saved to: {OUTPUT_PATH}')


if __name__ == '__main__':
    main()
