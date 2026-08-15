import { SPECIES } from './collections.js';

/**
 * One place that knows how every species-flavored phrase in the app reads
 * for cats vs. dogs, so a screen picks a label instead of hardcoding
 * "חתול" - added when this app grew from cats-only to cats+dogs. Hebrew
 * grammar, not inconsistency, is why cats read feminine ("החתולה") and dogs
 * read masculine ("הכלב") here: "חתולה" is the ordinary generic way to
 * refer to an unspecified cat in Hebrew, the same way "כלב" (not "כלבה") is
 * the generic for a dog - each phrase keeps whatever gender already read
 * naturally for that species, not a forced parallel form.
 */
export function petLabels(species) {
  const isDog = species === SPECIES.DOG;
  return {
    animal: isDog ? 'כלב' : 'חתול',
    animalDef: isDog ? 'הכלב' : 'החתולה',
    nameLabel: isDog ? 'שם הכלב' : 'שם החתולה',
    noNameFallback: isDog ? 'כלב ללא שם' : 'חתול ללא שם',
    petDetailsSection: isDog ? 'פרטי כלב' : 'פרטי חתול',
    conditionLabel: isDog ? 'מצב הכלב' : 'מצב החתול',
    lostCaseTitle: isDog ? 'פתיחת תיק חיפוש - כלב אבד' : 'פתיחת תיק חיפוש - חתול אבד',
    lostButton: isDog ? 'כלב שלי אבד' : 'חתול שלי אבד',
    foundButton: isDog ? 'ראיתי/מצאתי כלב' : 'ראיתי/מצאתי חתול',
    foundReportTitle: isDog ? 'דיווח על כלב שנראה / נמצא' : 'דיווח על חתול שנראה / נמצא',
    infoButtonTitle: isDog ? 'איך מוסיפים פוסט על הכלב?' : 'איך מוסיפים פוסט על החתולה?',
    smartAddPrompt: isDog
      ? 'נזהה אוטומטית אם זה דיווח על כלב שאבד או שנמצא/נראה, ונפתח את הרשומה המתאימה לבדיקה ותיקון.'
      : 'נזהה אוטומטית אם זה דיווח על חתול שאבד או שנמצא/נראה, ונפתח את הרשומה המתאימה לבדיקה ותיקון.',
    allFoundReportsTitle: isDog ? 'דיווחים על כלבים שנראו/נמצאו' : 'דיווחים על חתולים שנראו/נמצאו',
    allFoundReportsLink: isDog ? 'צפייה בכל הדיווחים על כלבים שנמצאו' : 'צפייה בכל הדיווחים על חתולים שנמצאו',
    openCasesSection: isDog ? 'תיקי חיפוש - כלבים' : 'תיקי חיפוש - חתולים',
    breedLabel: isDog ? 'גזע' : 'גזע (אם ידוע)',
    // Cats only get length categories (hairless/short/long) now - no
    // "curly" option - so "length" is the more accurate word for them;
    // dogs keep "type" since curly is a real texture distinction there.
    furTypeLabel: isDog ? 'סוג פרווה' : 'אורך פרווה',
    groupPlaceholder: isDog ? 'למשל "כלבים אבודים ונמצאים - תל אביב"' : 'למשל "חתולים אבודים ונמצאים - תל אביב"',
  };
}
