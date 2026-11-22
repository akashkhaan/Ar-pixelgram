// Run: node --test scripts/extract-ui-strings.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extract, isUiText } from './extract-ui-strings.mjs';

const src = `
import Foo from '@/components/Foo';
export const X = ({ profile, n }) => (
  <div className="flex items-center gap-2">
    <button aria-label="Go back">Edit profile</button>
    <span>{profile.full_name}</span>
    <p>{profile.bio}</p>
    <input placeholder="Search posts..." />
    <small>{\`\${n} views\`}</small>
  </div>
);
toast.success('Profile update हो गया!');
`;

test('app ka apna text translate list me aata hai', () => {
  const { strings, templates } = extract(src, 'a.tsx');
  assert.ok(strings.has('Edit profile'));
  assert.ok(strings.has('Go back'));
  assert.ok(strings.has('Search posts...'));
  assert.ok(strings.has('Profile update हो गया!'));
  assert.ok(templates.has('{0} views'));
});

test('classes, imports aur logon ka data list me nahi aata', () => {
  const { strings } = extract(src, 'a.tsx');
  assert.ok(!strings.has('flex items-center gap-2'));
  assert.ok(!strings.has('@/components/Foo'));
  assert.equal([...strings].some((s) => s.includes('full_name') || s.includes('bio')), false);
});

test('css jaise text UI nahi maana jata', () => {
  assert.equal(isUiText('w-4 h-4 text-primary'), false);
  assert.equal(isUiText('https://example.com'), false);
  assert.equal(isUiText('Follow'), true);
});
