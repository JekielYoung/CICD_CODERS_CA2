// PostgreSQL queries for itinerary activities
// Jekiel Young
const pool = require('../db');

const activityColumns = `a.activity_id,a.trip_id,a.title,a.location,
  to_char(a.activity_date,'YYYY-MM-DD') AS activity_date,
  to_char(a.start_time,'HH24:MI') AS start_time,
  to_char(a.end_time,'HH24:MI') AS end_time,a.notes,a.status,a.display_order`;

async function findByTrip(tripId) {
  const { rows } = await pool.query(`SELECT ${activityColumns} FROM public.activity a
    WHERE a.trip_id=$1 ORDER BY activity_date,display_order,start_time NULLS LAST,activity_id`,[tripId]);
  return rows;
}

async function create(tripId, b) {
  const { rows } = await pool.query(`INSERT INTO public.activity
    (trip_id,title,location,activity_date,start_time,end_time,notes,status,display_order)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
      (SELECT COALESCE(MAX(display_order)+1,0) FROM public.activity
       WHERE trip_id=$1 AND activity_date=$4)) RETURNING activity_id`,
    [tripId,b.title,b.location,b.activity_date,b.start_time,b.end_time,b.notes,b.status]);
  return rows[0];
}

async function update(tripId,activityId,b) {
  const {rowCount} = await pool.query(`UPDATE public.activity
    SET title=$1,location=$2,activity_date=$3,start_time=$4,end_time=$5,notes=$6,status=$7
    WHERE trip_id=$8 AND activity_id=$9`,
    [b.title,b.location,b.activity_date,b.start_time,b.end_time,b.notes,b.status,tripId,activityId]);
  return rowCount > 0;
}

async function remove(tripId,activityId) {
  const {rowCount}=await pool.query('DELETE FROM public.activity WHERE trip_id=$1 AND activity_id=$2',[tripId,activityId]);
  return rowCount>0;
}

module.exports={findByTrip,create,update,remove};
