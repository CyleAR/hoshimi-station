import { NextResponse } from 'next/server';
import { getAllCards, getCharacterList } from '@/lib/cardTracker';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const character = searchParams.get('character');
    const search = searchParams.get('search');
    const rarity = searchParams.get('rarity');

    let cards = getAllCards();

    // Filter by character
    if (character) {
      cards = cards.filter(c => c.characterId === character);
    }

    // Filter by rarity
    if (rarity) {
      cards = cards.filter(c => c.initialRarity === parseInt(rarity));
    }

    // Search by name
    if (search) {
      const q = search.toLowerCase();
      cards = cards.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.assetId.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
      );
    }

    // Sort by release date (newest first)
    cards.sort((a, b) => {
      const da = parseInt(a.releaseDate) || 0;
      const db = parseInt(b.releaseDate) || 0;
      return db - da;
    });

    const characters = getCharacterList();

    return NextResponse.json({ cards, characters });
  } catch (error) {
    console.error('Error loading cards:', error);
    return NextResponse.json({ error: 'Failed to load cards' }, { status: 500 });
  }
}
