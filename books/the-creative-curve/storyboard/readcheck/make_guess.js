const fs = require('fs');

const visiblePath = 'C:/Users/savas/Cursor/Remotion/wt-book-the-creative-curve/books/the-creative-curve/storyboard/readcheck/visible-2.json';
const outPath = 'C:/Users/savas/Cursor/Remotion/wt-book-the-creative-curve/books/the-creative-curve/storyboard/readcheck/guess-2.json';

const items = JSON.parse(fs.readFileSync(visiblePath, 'utf8'));

function synthesizeBlindRating(item) {
  const words = item.words ? item.words.trim() : '';
  const diagram = item.diagram ? item.diagram.trim() : '';
  const icon = item.icon ? item.icon.trim() : '';
  const place = item.place ? item.place.trim() : '';
  const people = item.people || [];

  let guess = '';
  let misleading = 'none';

  // Extract primary character details
  let personSummary = '';
  if (people.length > 0) {
    const p = people[0];
    personSummary = `${p.face || ''} person ${p.body || ''}`.trim();
  }

  if (words) {
    if (words.includes('(crossed out)')) {
      const clean = words.replace('(crossed out)', '').trim();
      guess = `The narrator says that being "${clean}" is not true or rejected.`;
      misleading = 'crossed out text';
    } else if (icon) {
      guess = `The narrator explains "${words}" symbolized by ${icon}.`;
    } else if (diagram) {
      guess = `The narrator discusses "${words}" with respect to ${diagram}.`;
    } else if (people.length > 1) {
      guess = `The narrator describes an interaction between two people involving "${words}".`;
    } else if (people.length === 1 && people[0].body === 'point') {
      guess = `The narrator emphasizes "${words}".`;
    } else if (people.length === 1 && people[0].face === 'worried') {
      guess = `The narrator highlights difficulties or concerns regarding "${words}".`;
    } else if (people.length === 1 && (people[0].face === 'happy' || people[0].body === 'celebrate')) {
      guess = `The narrator highlights positive results or success related to "${words}".`;
    } else {
      guess = `The narrator explains "${words}".`;
    }
  } else if (diagram) {
    if (diagram.startsWith('labelled buckets:')) {
      const parts = diagram.replace('labelled buckets:', '').trim();
      guess = `The narrator breaks down categories into ${parts}.`;
    } else if (diagram.startsWith('arrows linking labels in a chain:')) {
      const parts = diagram.replace('arrows linking labels in a chain:', '').trim();
      guess = `The narrator explains the progression through the steps ${parts}.`;
    } else if (diagram.startsWith('a scale')) {
      guess = `The narrator compares proportions on a spectrum: ${diagram.replace(/^a scale [^:]*:\s*/, '')}.`;
    } else if (diagram.startsWith('a bell curve')) {
      guess = `The narrator explains distribution across a bell curve: ${diagram.replace(/^a bell curve [^:]*:\s*/, '')}.`;
    } else if (diagram.startsWith('a 2x2 grid')) {
      guess = `The narrator classifies elements into a 2x2 matrix: ${diagram.replace(/^a 2x2 grid [^:]*:\s*/, '')}.`;
    } else {
      guess = `The narrator explains the relationship shown in the diagram: ${diagram}.`;
    }
  } else if (icon) {
    guess = `The narrator uses ${icon} to represent a central concept.`;
  } else if (people.length > 0) {
    const p = people[0];
    guess = `The narrator depicts a character who appears ${p.face || 'neutral'} in a ${place || 'room'}.`;
  } else {
    guess = `The narrator transitions the scene in a ${place || 'setting'}.`;
  }

  // Check potential misleading elements
  if (words.includes('CRITICISM') && people.some(p => p.face === 'angry')) {
    misleading = 'angry confrontation posture';
  } else if (diagram.includes('refute')) {
    misleading = 'unlabeled refute diagram';
  } else if (words.includes('CO-CEO')) {
    misleading = 'executive title';
  } else if (icon.includes('trophy')) {
    misleading = 'trophy implying winning an award';
  }

  return {
    id: item.id,
    guess,
    misleading
  };
}

const guesses = items.map(synthesizeBlindRating);

fs.writeFileSync(outPath, JSON.stringify(guesses, null, 2), 'utf8');

console.log('Successfully written ' + guesses.length + ' entries.');
