import { test } from '../../fixtures';

// There is no standalone "Add Card" button in the toolbar anymore
// (AddCardManager.tsx only opens the modal via the 'a' hotkey, driven by
// useHotkeyStore's addCardModalOpen). All three tests here open it that way;
// this one and testAddCardHotkeyAddsACard differ only in the submit method.

test('testAddCardAddsACard', async ({page}) => {
  await page.keyboard.press('a');
  await page.getByRole('textbox', { name: 'Enter the exact card name' }).fill('The Ultimate Nightmare of Wizards of the Coast® Customer Service');
  await page.getByRole('button', { name: 'Add to Hand' }).click();
  await page.getByAltText('The Ultimate Nightmare of Wizards of the Coast® Customer Service').waitFor({state: 'visible'});
})

test('testAddCardAddsACardUsingEnterKey', async ({page}) => {
  await page.keyboard.press('a');
  await page.getByRole('textbox', { name: 'Enter the exact card name' }).fill('The Ultimate Nightmare of Wizards of the Coast® Customer Service');
  await page.getByRole('textbox', { name: 'Enter the exact card name' }).press('Enter');
  await page.getByAltText('The Ultimate Nightmare of Wizards of the Coast® Customer Service').waitFor({state: 'visible'});
})

test('testAddCardHotkeyAddsACard', async ({page}) => {
  await page.keyboard.press('a');
  await page.getByRole('textbox', { name: 'Enter the exact card name' }).fill('The Ultimate Nightmare of Wizards of the Coast® Customer Service');
  await page.getByRole('button', { name: 'Add to Hand' }).click();
  await page.getByAltText('The Ultimate Nightmare of Wizards of the Coast® Customer Service').waitFor({state: 'visible'});
})
