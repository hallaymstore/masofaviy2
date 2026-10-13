import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';

test('ExcelJS workbook read/write remains compatible with secured uuid dependency',async()=>{
 const workbook=new ExcelJS.Workbook();
 const sheet=workbook.addWorksheet('Import');
 sheet.columns=[{header:'login',key:'login'},{header:'fullName',key:'fullName'}];
 sheet.addRow({login:'sample-test',fullName:'Sample Test'});
 const bytes=await workbook.xlsx.writeBuffer();
 const second=new ExcelJS.Workbook();await second.xlsx.load(bytes);
 assert.equal(second.getWorksheet('Import').getRow(2).getCell(1).value,'sample-test');
});
