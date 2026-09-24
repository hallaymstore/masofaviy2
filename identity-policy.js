// VM 559, 21-band: production student onboarding is in person.
// Foreign citizens are exempt from the 21-band in-person requirement.
export function requireInPersonIdentity(nodeEnv='development',configured=''){
  return nodeEnv==='production'||String(configured).toLowerCase()==='true';
}
export function requiresIdentityForUser(user,roles=['student']){
  return roles.includes(user?.role)&&String(user?.citizenshipCountry||'UZ').toUpperCase()==='UZ'&&!user?.identityVerifiedAt;
}
