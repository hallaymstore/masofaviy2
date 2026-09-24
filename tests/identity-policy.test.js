import test from 'node:test';
import assert from 'node:assert/strict';
import {requireInPersonIdentity,requiresIdentityForUser} from '../identity-policy.js';

test('in-person student verification cannot be disabled in production',()=>{
  assert.equal(requireInPersonIdentity('production','false'),true);
  assert.equal(requireInPersonIdentity('production',''),true);
  assert.equal(requireInPersonIdentity('development','false'),false);
  assert.equal(requireInPersonIdentity('development','true'),true);
});
test('foreign citizen exemption applies to 21-band in-person student check',()=>{
  assert.equal(requiresIdentityForUser({role:'student',citizenshipCountry:'UZ'}),true);
  assert.equal(requiresIdentityForUser({role:'student',citizenshipCountry:'KZ'}),false);
  assert.equal(requiresIdentityForUser({role:'student',citizenshipCountry:'UZ',identityVerifiedAt:new Date()}),false);
  assert.equal(requiresIdentityForUser({role:'teacher',citizenshipCountry:'UZ'}),false);
});
