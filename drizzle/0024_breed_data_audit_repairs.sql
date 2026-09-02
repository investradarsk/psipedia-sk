-- Repair the only unambiguous numeric corruption found by the full breed audit.
-- Guard the update with the exact bad values so a later manual correction is preserved.
UPDATE `managed_breeds`
SET `height` = '52–62 cm', `updated_at` = CURRENT_TIMESTAMP, `updated_by` = 'breed-data-audit'
WHERE `fci_number` = 171 AND TRIM(`height`) = '454';
--> statement-breakpoint
UPDATE `managed_breeds`
SET `weight` = '22–35 kg', `updated_at` = CURRENT_TIMESTAMP, `updated_by` = 'breed-data-audit'
WHERE `fci_number` = 171 AND TRIM(`weight`) = '4544545';
--> statement-breakpoint
-- Store the same Slovak FCI section labels that the public detail already uses.
UPDATE `managed_breeds`
SET `fci_section` = CASE (`fci_group` || ':' || TRIM(`fci_section_number`))
  WHEN '1:1' THEN 'Ovčiarske psy'
  WHEN '1:2' THEN 'Pastierske psy okrem švajčiarskych salašníckych psov'
  WHEN '2:1.1' THEN 'Pinče'
  WHEN '2:1.2' THEN 'Bradáče'
  WHEN '2:1.3' THEN 'Holandské smoushondy'
  WHEN '2:1.4' THEN 'Čierny ruský teriér'
  WHEN '2:2.1' THEN 'Molosoidné plemená – mastifový typ'
  WHEN '2:2.2' THEN 'Molosoidné plemená – horský typ'
  WHEN '2:3' THEN 'Švajčiarske salašnícke a pastierske psy'
  WHEN '3:1' THEN 'Veľké a stredné teriéry'
  WHEN '3:2' THEN 'Malé teriéry'
  WHEN '3:3' THEN 'Teriéry typu bull'
  WHEN '3:4' THEN 'Toy teriéry'
  WHEN '5:1' THEN 'Severské záprahové psy'
  WHEN '5:2' THEN 'Severské poľovné psy'
  WHEN '5:3' THEN 'Severské strážne a pastierske psy'
  WHEN '5:4' THEN 'Európske špice'
  WHEN '5:5' THEN 'Ázijské špice a príbuzné plemená'
  WHEN '5:6' THEN 'Primitívne plemená'
  WHEN '5:7' THEN 'Primitívne plemená – poľovné psy'
  WHEN '6:1.1' THEN 'Duriče veľkých plemien'
  WHEN '6:1.2' THEN 'Duriče stredných plemien'
  WHEN '6:1.3' THEN 'Duriče malých plemien'
  WHEN '6:2' THEN 'Farbiare'
  WHEN '6:3' THEN 'Príbuzné plemená'
  WHEN '7:1.1' THEN 'Kontinentálne stavače – typ braka'
  WHEN '7:1.2' THEN 'Kontinentálne stavače – typ španiela'
  WHEN '7:1.3' THEN 'Kontinentálne stavače – typ grifóna'
  WHEN '7:2.1' THEN 'Britské a írske stavače a setre – pointer'
  WHEN '7:2.2' THEN 'Britské a írske stavače a setre – seter'
  WHEN '8:1' THEN 'Retrievery'
  WHEN '8:2' THEN 'Sliediče'
  WHEN '8:3' THEN 'Vodné psy'
  WHEN '9:1.1' THEN 'Bišóny'
  WHEN '9:1.2' THEN 'Coton de Tuléar'
  WHEN '9:1.3' THEN 'Levíček'
  WHEN '9:2' THEN 'Pudle'
  WHEN '9:3.1' THEN 'Grifóny'
  WHEN '9:3.2' THEN 'Petit Brabançon'
  WHEN '9:4' THEN 'Bezsrsté psy'
  WHEN '9:5' THEN 'Tibetské plemená'
  WHEN '9:6' THEN 'Čivava'
  WHEN '9:7' THEN 'Anglické spoločenské španiele'
  WHEN '9:8' THEN 'Japonský chin a pekinský palácový psík'
  WHEN '9:9' THEN 'Kontinentálny spoločenský španiel a ďalšie plemená'
  WHEN '9:10' THEN 'Kromfohrländer'
  WHEN '9:11' THEN 'Malé molosoidné psy'
  WHEN '10:1' THEN 'Dlhosrsté alebo strapcovité chrty'
  WHEN '10:2' THEN 'Hrubosrsté chrty'
  WHEN '10:3' THEN 'Krátkosrsté chrty'
  ELSE `fci_section`
END,
`updated_at` = CURRENT_TIMESTAMP,
`updated_by` = 'breed-data-audit'
WHERE `fci_number` IS NOT NULL
  AND `import_key` IS NOT NULL
  AND TRIM(`import_key`) <> ''
  AND (`fci_group` || ':' || TRIM(`fci_section_number`)) IN (
    '1:1','1:2','2:1.1','2:1.2','2:1.3','2:1.4','2:2.1','2:2.2','2:3','3:1','3:2','3:3','3:4',
    '5:1','5:2','5:3','5:4','5:5','5:6','5:7','6:1.1','6:1.2','6:1.3','6:2','6:3',
    '7:1.1','7:1.2','7:1.3','7:2.1','7:2.2','8:1','8:2','8:3','9:1.1','9:1.2','9:1.3','9:2',
    '9:3.1','9:3.2','9:4','9:5','9:6','9:7','9:8','9:9','9:10','9:11','10:1','10:2','10:3'
  );
