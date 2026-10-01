const fs = require('fs');
const path = require('path');

const tabsDir = path.join(__dirname, '../src/components/tabs');
const files = fs.readdirSync(tabsDir).filter(f => f.endsWith('.tsx') && f !== 'HomeTab.tsx');

let changedCount = 0;

for (const file of files) {
  const filePath = path.join(tabsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // We are looking for the main sticky header.
  // It usually looks like:
  // <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md px-4 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-border/10">
  // We want to replace it.

  // Match: <div className="sticky top-0 z-30 ...">
  const stickyRegex = /<div className="sticky top-0 z-30[^"]*"(.*?)>/g;
  
  let match;
  let firstMatch = null;
  while ((match = stickyRegex.exec(content)) !== null) {
      if (!firstMatch) {
          firstMatch = {
              full: match[0],
              index: match.index,
              rest: match[1]
          };
      }
  }

  if (firstMatch) {
    const originalDiv = firstMatch.full;
    if (originalDiv.includes('absolute inset-x-0')) {
      console.log(`Skipping ${file}, already has progressive blur`);
      continue;
    }

    // Extract classes
    const classMatch = originalDiv.match(/className="([^"]+)"/);
    if (!classMatch) continue;
    let classes = classMatch[1].split(' ');
    
    // Remove border, bg, backdrop-blur
    classes = classes.filter(c => 
      !c.startsWith('bg-') && 
      !c.startsWith('backdrop-blur') && 
      !c.startsWith('border')
    );
    
    // Ensure relative is there for the mask
    if (!classes.includes('relative')) {
        // Insert relative after sticky top-0 z-30
        const z30Index = classes.indexOf('z-30');
        if (z30Index !== -1) {
            classes.splice(z30Index + 1, 0, 'relative');
        } else {
            classes.push('relative');
        }
    }

    const newOuterClass = classes.join(' ');

    const blurDiv = `\n        <div className="absolute inset-x-0 top-0 h-24 z-0 bg-gradient-to-b from-background/95 via-background/70 to-transparent backdrop-blur-xl [mask-image:linear-gradient(to_bottom,black_0%,black_52%,transparent_100%)] pointer-events-none" />`;
    
    // The next div (usually the one wrapping the title and back button) needs relative z-10 min-w-0 drop-shadow-[0_1px_3px_hsl(var(--background)/0.9)]
    // To do this simply, we can just replace the outer div and inject the blur div.
    // Then we need to add relative z-10 to the immediate children of this sticky div.
    // However, string replacement on children is risky. 
    // What if we just wrap the inner contents in a new div? But that breaks layout if there are multiple children (like AccountQuickButton).
    // Instead, what if we just make the blur div position absolute and NOT wrap the children?
    // If the blur div is z-0, and the sticky div is z-30 relative, then children of the sticky div (which don't have z-index) will be drawn in DOM order.
    // If we put the blur div FIRST, the other children (title, buttons) will naturally render ON TOP of the blur div because they come later in the DOM order within the same stacking context!
    // We just need to give the flex container (which we kept on the sticky div) a little help if needed. But wait, if children have z-index, it matters. Most don't.
    // Let's test just inserting the blur div.
    // Wait, the text needs drop-shadow. We can apply drop-shadow to the sticky container? No, that would drop-shadow the blur too.
    // Let's apply drop-shadow to the first child div.
    
    const replacement = `<div className="${newOuterClass}"${firstMatch.rest}>${blurDiv}`;
    
    // Replace the sticky div opening tag
    content = content.substring(0, firstMatch.index) + replacement + content.substring(firstMatch.index + originalDiv.length);
    
    // Now find the next <div className="flex..." or similar that follows immediately
    const nextDivRegex = /\n\s*<div className="([^"]+)"/;
    const nextDivMatch = content.substring(firstMatch.index + replacement.length).match(nextDivRegex);
    if (nextDivMatch) {
       let innerClasses = nextDivMatch[1];
       if (!innerClasses.includes('relative z-10')) {
           innerClasses += ' relative z-10 min-w-0 drop-shadow-[0_1px_3px_hsl(var(--background)/0.9)]';
       }
       const newNextDiv = `\n        <div className="${innerClasses}"`;
       content = content.substring(0, firstMatch.index + replacement.length + nextDivMatch.index) + 
                 newNextDiv + 
                 content.substring(firstMatch.index + replacement.length + nextDivMatch.index + nextDivMatch[0].length);
    }

    // Also find AccountQuickButton if it exists right after, and wrap it or add relative z-10 to its wrapper if it exists?
    // AccountQuickButton doesn't strictly need the drop shadow, but it needs to be above the blur.
    // By DOM order it is above the blur if it comes after it.
    
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
    changedCount++;
  }
}

console.log(`Total changed: ${changedCount}`);
