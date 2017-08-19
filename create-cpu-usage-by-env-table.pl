#!/usr/bin/perl -w


my %table;
while (my $line = <>) {
  $line =~ s/\r\n//;
  my @cols = split(/ /,$line);
  my $type = (split(/-/, $cols[3]))[0];
  my $env = $cols[5];
  my $version = $cols[6];
  my $percent_cpu = $cols[7];
  my $key = "$type-$version".($env eq "master" ? "-master" : "");
  push(@{$table{$key}}, $percent_cpu);
}

$max_length = 0;
my $i = 0;
my $keys_length = scalar(keys %table);
foreach my $key (sort(keys %table)) {
  print("$key");
  print(++$i < $keys_length ? " " : "\n");
  my $length = scalar(@{$table{$key}});
  if ($max_length < $length) {
    $max_length = $length;
  }
  $table{$key} = [sort( { $a <=> $b }  @{$table{$key}})]; 
}

for (my $i = 0; $i < $max_length; $i++) {
  foreach my $key (sort(keys %table)) {
    print($i <= $#{$table{$key}} ? "${$table{$key}}[$i] " : " ");
  }
  print("\n");
}
