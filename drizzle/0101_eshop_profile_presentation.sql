ALTER TABLE managed_eshops ADD COLUMN logo_url TEXT;
ALTER TABLE managed_eshops ADD COLUMN logo_key TEXT;
ALTER TABLE managed_eshops ADD COLUMN focus_tags_json TEXT NOT NULL DEFAULT '[]';

UPDATE managed_eshops
SET focus_tags_json = CASE slug
  WHEN 'super-zoo' THEN '["Kompletný sortiment","Krmivo","Hračky","Starostlivosť","Výcvik"]'
  WHEN 'petcenter' THEN '["Kompletný sortiment","Krmivo","Hračky","Starostlivosť","Doplnky"]'
  WHEN 'zoohit' THEN '["Kompletný sortiment","Krmivo","Pelechy","Hračky","Doplnky"]'
  WHEN 'spokojny-pes' THEN '["Krmivo","Maškrty","Hračky","Pelechy","Doplnky"]'
  WHEN 'abc-zoo' THEN '["Kompletný sortiment","Krmivo","Hračky","Prepravky","Doplnky"]'
  ELSE focus_tags_json
END
WHERE slug IN ('super-zoo','petcenter','zoohit','spokojny-pes','abc-zoo');
