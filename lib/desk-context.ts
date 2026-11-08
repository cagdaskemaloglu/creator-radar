const norm=(s:string)=>' '+s.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('tr-TR').replace(/ı/g,'i').replace(/[^a-z0-9]+/g,' ').trim()+' ';
export function deskContext(text:string){
 const s=norm(text),digital=/\b(?:monitor\w*|klavye\w*|keyboard\w*|bilgisayar\w*|laptop\w*|mouse\w*|gaming|pc|ekran\w*|kablo\w*)\b/.test(s);
 const specific=/\b(?:desksetup\w*|desk setup\w*|monitor setup|monitorsetup|keyboard setup|keyboardsetup|monitor kurulumu|klavye kurulumu|battlestation\w*|workspace setup|workspacesetup|calisma masa\w*|calismamasa\w*|bilgisayarmasa\w*|oyunmasa\w*|masakurulumu)\b/.test(s);
 const table=/\b(?:yemek masa\w*|yemekmasa\w*|sofra\w*|dugun\w*|nisan\w*|masa ortu\w*|masaortu\w*|vazo\w*|dining\w*|tablescape\w*)\b/.test(s);
 const desk=/\b(?:desk\w*|workspace\w*|masa\w*|calisma alani|calismaalan\w*)\b/.test(s);
 return{eligible:(specific&&!table)||(digital&&desk),ambiguous:desk&&!specific&&!digital||table&&!digital};
}
