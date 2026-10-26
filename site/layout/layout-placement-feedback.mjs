// Present existing placement findings without changing the placement decision.
import {hasMessage} from './layout-i18n.mjs?v=732a8fe1ed9d3e5b9352';
export function placementStatus(proposal,t){
  if(proposal?.valid)return t('layout.place.ready');
  const fallback=t('layout.place.blocked');
  for(const issue of proposal?.issues||[]){
    for(const prefix of ['layout.warning.','layout.error.']){
      const key=prefix+issue.code;if(!hasMessage(key))continue;
      try{return fallback+' · '+t(key,issue.params||{});}catch{/* Try the next complete localized reason. */}
    }
  }
  return fallback;
}
