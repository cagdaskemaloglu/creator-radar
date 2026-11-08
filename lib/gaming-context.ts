// Generic Turkish "oyun/oyuncu" can describe toys, actors or family activities.
const norm=(s:string)=>' '+s.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('tr-TR').replace(/ı/g,'i').replace(/[^a-z0-9]+/g,' ').trim()+' ';
export function gamingContext(text:string){
 const s=norm(text),hardDigital=/\b(?:twitch|steam|playstation|xbox|nintendo|valorant|minecraft|fortnite|pubg|cs2|espor|e spor|video oyun\w*|bilgisayar oyun\w*|konsol oyun\w*)\b/.test(s);
 const family=/\b(?:cocuk\w*|bebek\w*|oyuncak\w*|montessori|okul oncesi|anaokul\w*|aile etkinli\w*)\b/.test(s);
 const creator=/\boyun\w*\b/.test(s)&&/\b(?:yayin\w*|inceleme\w*|rehber\w*|kanal\w*|videolari|videolar\w*)\b/.test(s);
 const digital=hardDigital||(!family&&/\b(?:gaming|gamer)\b/.test(s));
 return{eligible:digital||(!family&&creator),ambiguous:/\b(?:oyun|oyuncu)\b/.test(s)&&!digital&&(!creator||family),family,digital};
}
