# 0140 — Italian is written, not translated, and English says what it means

**Status**: Accepted — 2026-10-17. Applies to every text a person reads in Kometio: the editor, the public site's own words, the emails, the starters and the documentation.

## Context

The owner's verdict on the Italian, on 14 October: the texts read as translations, clumsy, and he knows they can be better. He was right about the way they were made. The English was written first and the Italian followed it sentence by sentence, so it kept English's order, English's nouns piled on each other and English's habit of speaking in the first person plural. Nobody wrote a rule down, so every pass by a different hand left its own habit: `l'indirizzo` and `l’indirizzo` in the same file, `"…"`, `“…”` and `«…»` around a quoted name, `...` and `…`, _bottone_ and _pulsante_, _cancellare_ and _eliminare_, _spegni_ beside _disattiva_, _mail_ beside _email_, and three words for one thing (_Step_ in the form editor, _Passaggi_ in the block of the same name, _Passo_ on the public site).

The English had the opposite fault. It was grammatical and often said nothing: "That change could not be made." — which change, to what? — and "This did not work."

## Decision

The rules below are the standard. They are enforced where a machine can enforce them (`apps/editor-app/src/locales/locale-style.spec.ts`) and in review where it cannot.

### Italian is written for an Italian reader

- Write the sentence the way an Italian would say it, from the same knowledge, not from the English sentence. If it only works as a calque, it is the wrong sentence.
- **Tu**, and the imperative for what the person does: "scegli", "incolla", "riprova".
- The product does not speak as _io_ or as _noi_ about itself. "Lettura del file…", not "Sto leggendo il file…"; "Non è stato possibile leggere il file", not "Non sono riuscito a…". A message about an event says what happened to the thing: "La foto non è stata salvata."
- Short sentences. Verbs and not stacked nouns: "Conferma che sei tu" and not "Conferma di identità utente".
- The English word stays where the person will meet it as it is outside Kometio (_email_, _captcha_, _hash_), where Italian has no word in use for it (_slug_) or where the product itself shows it (a file name, `theme.json`). Where Italian has a word, use it (_blocco_, _tema_, _accedi_).

### Typography, the same everywhere

|                 | Italian                                                                        | English             |
| --------------- | ------------------------------------------------------------------------------ | ------------------- |
| Apostrophe      | `’` (U+2019)                                                                   | `’`                 |
| Quoted name     | `«…»`                                                                          | `“…”`               |
| Ellipsis        | `…` (one character)                                                            | `…`                 |
| Delete / remove | _eliminare_ for what is destroyed, _rimuovere_ for what is taken out of a list | _delete_ / _remove_ |

The straight `'` and `"` stay only where they are code: a command, a placeholder, a value somebody types.

### One word for one thing

| English                        | Italian                                                          | Not                                                              |
| ------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| parent page                    | pagina superiore                                                 | pagina genitore, pagina madre                                    |
| subpage                        | sottopagina                                                      |                                                                  |
| shared section                 | sezione condivisa                                                | sezione riusabile                                                |
| template                       | template                                                         | modello (it is the product's word; the docs say what it is once) |
| submission (of a form)         | risposta                                                         | invio                                                            |
| step (of a form, of a process) | passaggio                                                        | passo, step                                                      |
| button                         | pulsante                                                         | bottone                                                          |
| email, mail server             | email, server di posta                                           | mail                                                             |
| delete a thing for good        | eliminare                                                        | cancellare                                                       |
| turn on / turn off             | attivare / disattivare                                           | accendere / spegnere                                             |
| draft / unpublished changes    | bozza / modifiche non pubblicate                                 |                                                                  |
| optional                       | facoltativo                                                      | opzionale                                                        |
| captcha                        | captcha                                                          |                                                                  |
| sign in / sign out             | accedere / uscire; _scollegare_ for one of the devices signed in |                                                                  |

A term that is added to the product is added to this table in the same change.

### English says what it means

- A failure names what failed and says what to do: "The form was not saved. Try again." — not "That did not work."
- A button names the action and, when two buttons are on screen, what it acts on.
- American spelling: _color_, _center_, _canceled_, _favorites_.
- A hint says what happens, not what the field is: "Shown under the articles you write" and not "Display name".

## Consequences

- 318 of the editor's and the public site's own texts (of about 2,700) changed wording or typography in the pass that came with this decision; the starters, the emails and the legal templates were read and left as they were. Every spec that read an Italian sentence was updated with it; the end-to-end suite is not touched, because it asks the editor's locale files for a text by key.
- `locale-style.spec.ts` fails a pull request that brings back a straight apostrophe or quote, three dots, or one of the words in the table's _Not_ column, in an Italian or English file of the editor or of the public site's own words. It cannot tell whether a sentence is good Italian: that stays a review.
- The documentation site follows the same rules and the structure in [writing-user-docs.md](../writing-user-docs.md): a heading for every task, a list for every set of things, a table for a reference, a code block for what is typed.
