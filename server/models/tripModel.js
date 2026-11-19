// PostgreSQL queries relating to trips
// Jekiel Young 
const pool = require('../db');

const tripColumns = `t.trip_id, t.user_id, t.title, t.destination,
  to_char(t.start_date, 'YYYY-MM-DD') AS start_date,
  to_char(t.end_date, 'YYYY-MM-DD') AS end_date,
  t.description, t.is_public, t.traveler_count`;

async function findForUser(userId) {
  const { rows } = await pool.query(`SELECT ${tripColumns} FROM public.trip t
    WHERE t.user_id=$1 OR EXISTS
    (SELECT 1 FROM public.trip_member m WHERE m.trip_id=t.trip_id AND m.user_id=$1)
    ORDER BY t.start_date DESC, t.trip_id DESC`, [userId]);
  return rows;
}

async function create(userId, values) {
  const { rows } = await pool.query(`INSERT INTO public.trip
    (user_id,title,destination,start_date,end_date,description,traveler_count)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING trip_id`,
    [userId,values.title,values.destination,values.start_date,
      values.end_date,values.description,values.travelers]);
  return rows[0];
}

async function findById(id) {
  const { rows } = await pool.query(`SELECT ${tripColumns} FROM public.trip t WHERE t.trip_id=$1`,[id]);
  return rows[0] || null;
}

async function getMembers(id) {
  const { rows } = await pool.query(`SELECT u.user_id,u.name,u.email,m.role::text AS role
    FROM public.trip_member m JOIN public.app_user u ON u.user_id=m.user_id
    WHERE m.trip_id=$1 ORDER BY CASE WHEN m.role='Owner' THEN 0 ELSE 1 END,u.name`,[id]);
  return rows;
}

async function getAccess(tripId, userId, db = pool) {
  const { rows } = await db.query(`SELECT t.user_id,
    CASE WHEN t.user_id=$2 THEN 'Owner' ELSE tm.role::text END AS role
    FROM public.trip t LEFT JOIN public.trip_member tm
      ON tm.trip_id=t.trip_id AND tm.user_id=$2
    WHERE t.trip_id=$1 AND (t.user_id=$2 OR tm.trip_member_id IS NOT NULL)`,[tripId,userId]);
  return rows[0] || null;
}

async function dateIsWithinTrip(tripId, date, db = pool) {
  const { rowCount } = await db.query(
    'SELECT 1 FROM public.trip WHERE trip_id=$1 AND $2::date BETWEEN start_date AND end_date',
    [tripId,date]);
  return rowCount > 0;
}

async function extendDay(id) {
  const { rows } = await pool.query(`UPDATE public.trip SET end_date=end_date+1 WHERE trip_id=$1
    RETURNING to_char(end_date,'YYYY-MM-DD') AS end_date`,[id]);
  return rows[0] || null;
}

async function findUserByEmail(email) {
  const { rows } = await pool.query('SELECT user_id,name FROM public.app_user WHERE LOWER(email)=$1',[email]);
  return rows[0] || null;
}

async function addMember(tripId,userId) {
  const { rows } = await pool.query(`INSERT INTO public.trip_member(trip_id,user_id,role)
    VALUES($1,$2,'Member') ON CONFLICT(trip_id,user_id) DO NOTHING
    RETURNING trip_member_id`,[tripId,userId]);
  return rows[0] || null;
}

module.exports = {findForUser,create,findById,getMembers,getAccess,dateIsWithinTrip,
  extendDay,findUserByEmail,addMember};
