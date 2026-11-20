const fs = require('fs');
const path = require('path');

const dir = path.join('/app/applet/src/components');
const files = fs.readdirSync(dir);

files.forEach(file => {
  if (!file.endsWith('.tsx')) return;
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  if (content.includes("await import('../lib/supabase')") || content.includes('await import("../lib/supabase")')) {
    content = content.replace(/\s*const\s*\{\s*supabase\s*\}\s*=\s*await\s+import\(['"]\.\.\/lib\/supabase['"]\);?/g, '');

    if (!content.includes("import { supabase } from")) {
      content = "import { supabase } from '../lib/supabase';\n" + content;
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${file}`);
  }
});
console.log('Done fixing supabase imports.');
